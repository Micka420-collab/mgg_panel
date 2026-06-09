import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertScope, assertNotSuspended } from "@/lib/access";
import { buildServerSpec } from "@/lib/spec";
import { DaemonClient } from "@/lib/daemon";
import { requireTemplate } from "@mgg/shared";
import { resolveGameVersion } from "@/lib/modrinth";
import { enforceBackupRetention } from "@/lib/backups";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Version upgrade assistant. For itzg-powered Minecraft servers the `VERSION`
 * env var drives the game version the image self-provisions on boot. This route
 * surfaces the current vs. latest release version and performs a safe, one-click
 * upgrade: take a safety backup first, then bump VERSION and re-persist the spec
 * without rebuilding (the new version applies on the next start).
 */

/** Is this server upgradeable by us (an itzg/Minecraft server that reads VERSION)? */
function minecraftVersionVar(templateId: string, env: Record<string, string>): boolean {
  try {
    const template = requireTemplate(templateId);
    if (template.game !== "minecraft") return false;
    // Must actually expose a user-editable VERSION variable.
    return template.variables.some((v) => v.key === "VERSION");
  } catch {
    return false;
  }
}

/** Naive semver-ish comparison of two Minecraft release versions ("1.21.4"). */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10));
  const pb = b.split(".").map((n) => parseInt(n, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x - y;
  }
  return 0;
}

export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.read");

  const env = (c.server.environment as Record<string, string>) ?? {};
  const supported = minecraftVersionVar(c.server.templateId, env);
  const currentRaw = env.VERSION ?? "";
  // The concrete version the server is pinned to ("LATEST"/"SNAPSHOT" → a number).
  const currentResolved = await resolveGameVersion(currentRaw);
  // Latest stable release tag from Modrinth's game_version tag list.
  const latest = await resolveGameVersion("LATEST");

  // Pinned to a concrete number that's behind latest → upgradeable. If the server
  // tracks LATEST/SNAPSHOT it auto-updates on restart, so nothing to do here.
  const isPinned =
    !!currentRaw && !["LATEST", "SNAPSHOT"].includes(currentRaw.trim().toUpperCase());
  let upgradeable = false;
  if (supported && isPinned && latest && currentResolved) {
    upgradeable = compareVersions(latest, currentResolved) > 0;
  }

  return json({
    supported,
    current: currentRaw || null,
    currentResolved,
    latest,
    pinned: isPinned,
    upgradeable,
  });
});

const schema = z.object({ version: z.string().min(1).max(40) });

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.update");
  assertNotSuspended(c);

  const env = { ...((c.server.environment as Record<string, string>) ?? {}) };
  if (!minecraftVersionVar(c.server.templateId, env)) {
    throw new HttpError(400, "This server type doesn't support the version upgrade assistant.");
  }

  const { version } = schema.parse(await req.json());
  // Accept either a concrete version ("1.21.4") or the LATEST/SNAPSHOT keywords.
  const target = version.trim();
  if (!/^[A-Za-z0-9._+-]+$/.test(target)) {
    throw new HttpError(422, "Invalid version string.");
  }
  const previous = env.VERSION ?? null;
  if (previous === target) {
    throw new HttpError(400, `The server is already on ${target}.`);
  }

  // (1) Safety backup BEFORE touching the version, so a bad upgrade is reversible.
  //     Honour retention so the archive dir can't fill the disk.
  await enforceBackupRetention(c.server.id, c.node);
  const count = await db.backup.count({ where: { serverId: c.server.id } });
  const backupName = `Pre-upgrade ${previous ?? "?"} → ${target}`;
  const backupRow = await db.backup.create({
    data: { serverId: c.server.id, name: backupName, completed: false },
  });
  try {
    const meta = await new DaemonClient(c.node).createBackup(c.server.id, backupRow.id, backupRow.name);
    await db.backup.update({
      where: { id: backupRow.id },
      data: { completed: true, sizeBytes: BigInt(meta.sizeBytes), checksum: meta.checksum },
    });
  } catch (e: any) {
    await db.backup.delete({ where: { id: backupRow.id } }).catch(() => {});
    throw new HttpError(502, `Safety backup failed, upgrade aborted: ${e?.message ?? "backup error"}`);
  }

  // (2) Bump VERSION and persist. (3) Re-register WITHOUT rebuilding so a running
  //     server isn't killed; the itzg image migrates to the new version on next start.
  env.VERSION = target;
  const updated = await db.server.update({
    where: { id: c.server.id },
    data: { environment: env as object },
    include: { allocations: true, node: true },
  });
  await new DaemonClient(updated.node).registerServer(
    buildServerSpec(updated, updated.allocations),
    false,
  );

  await audit("server.upgrade", {
    userId: user.id,
    serverId: c.server.id,
    metadata: { from: previous, to: target, backupId: backupRow.id },
  });

  // (4) ok.
  return json({
    ok: true,
    from: previous,
    to: target,
    backupId: backupRow.id,
    note: "A safety backup was taken. Restart the server to boot the new version.",
  });
});
