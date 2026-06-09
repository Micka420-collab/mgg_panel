import { z } from "zod";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertScope, assertNotSuspended } from "@/lib/access";
import { DaemonClient } from "@/lib/daemon";
import { modContext, resolveGameVersion } from "@/lib/modrinth";
import { analyzeMods, type ModDoctorContext, type ModFile } from "@/lib/mod-doctor";
import { hasScope } from "@mgg/shared";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Mod Conflict Doctor.
 *
 * GET  — list the server's mods/ (Fabric/Forge) or plugins/ (Paper/Spigot)
 *        directory via the daemon file API and run the heuristic analyzer.
 *        Read-only, gated on `startup.read`.
 * POST — { files: string[], action: "quarantine" | "restore" } moves the named
 *        jars between e.g. mods/ and mods/.disabled, non-destructively, via the
 *        daemon's rename (cross-dir move). Gated on `startup.update` or
 *        `file.write`.
 *
 * Everything is best-effort: a missing mods folder yields an empty report
 * rather than an error, so it's safe on a brand-new server.
 */

/** Which folder holds this server's content, given its loader family. */
function scanFolder(loader: string | null): { dir: string; kind: "mods" | "plugins" } {
  const l = (loader ?? "").toLowerCase();
  const plugins = ["paper", "purpur", "spigot", "bukkit", "folia"];
  if (plugins.includes(l)) return { dir: "plugins", kind: "plugins" };
  return { dir: "mods", kind: "mods" };
}

const DISABLED_SUFFIX = ".disabled"; // appended folder name + extension marker

function assertMinecraft(game: string) {
  if (game !== "minecraft") throw new HttpError(400, "Mod Doctor is only available for Minecraft servers.");
}

export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.read");
  assertMinecraft(c.server.game);

  const env = (c.server.environment as Record<string, string>) ?? {};
  const mctx = modContext(env);
  const { dir, kind } = scanFolder(mctx.loader);
  const mcVersion = await resolveGameVersion(env.VERSION).catch(() => null);

  const client = new DaemonClient(c.node);

  // List the content dir and its `.disabled` quarantine subdir. Either may not
  // exist yet (fresh server / nothing quarantined) — treat that as empty.
  const [active, quarantined] = await Promise.all([
    client
      .listFiles(c.server.id, `/${dir}`)
      .then((r) => r.entries)
      .catch(() => []),
    client
      .listFiles(c.server.id, `/${dir}/${DISABLED_SUFFIX}`)
      .then((r) => r.entries)
      .catch(() => []),
  ]);

  const files: ModFile[] = [
    ...active.filter((e) => !e.isDir).map((e) => ({ name: e.name, path: e.path, size: e.size })),
    // Mark quarantined jars with a .disabled tail so the analyzer reports them as "disabled".
    ...quarantined
      .filter((e) => !e.isDir && /\.jar(\.disabled)?$/i.test(e.name))
      .map((e) => ({
        name: /\.disabled$/i.test(e.name) ? e.name : `${e.name}.disabled`,
        path: e.path,
        size: e.size,
      })),
  ];

  const dctx: ModDoctorContext = { loader: mctx.loader, mcVersion: mcVersion ?? null, kind };
  const report = analyzeMods(files, dctx);

  return json({
    ...report,
    dir,
    quarantineDir: `${dir}/${DISABLED_SUFFIX}`,
    quarantined: quarantined.filter((e) => !e.isDir).map((e) => e.name),
    canFix: hasScope(c.scopes, "startup.update") || hasScope(c.scopes, "file.write"),
  });
});

// Basenames only — reject any path separators so we can never move arbitrary files.
const fileName = z
  .string()
  .min(1)
  .max(255)
  .refine((s) => !s.includes("/") && !s.includes("\\") && s !== "." && s !== "..", "invalid filename")
  .refine((s) => /\.jar(\.disabled)?$/i.test(s), "only .jar files can be quarantined");

const bodySchema = z.object({
  files: z.array(fileName).min(1).max(200),
  action: z.enum(["quarantine", "restore"]),
});

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  // Either scope grants the apply action.
  if (!hasScope(c.scopes, "startup.update") && !hasScope(c.scopes, "file.write")) {
    throw new HttpError(403, "Missing permission: startup.update or file.write");
  }
  assertNotSuspended(c);
  assertMinecraft(c.server.game);

  const { files, action } = bodySchema.parse(await req.json());
  const env = (c.server.environment as Record<string, string>) ?? {};
  const mctx = modContext(env);
  const { dir } = scanFolder(mctx.loader);
  const client = new DaemonClient(c.node);

  // Make sure the quarantine folder exists before moving into it.
  if (action === "quarantine") {
    await client.mkdir(c.server.id, `/${dir}/${DISABLED_SUFFIX}`).catch(() => {});
  }

  const moved: string[] = [];
  const failed: { file: string; error: string }[] = [];

  for (const raw of files) {
    // Normalize: quarantine wants the live name; restore wants the disabled name.
    const base = raw.replace(/\.disabled$/i, "");
    try {
      if (action === "quarantine") {
        const from = `/${dir}/${base}`;
        const to = `/${dir}/${DISABLED_SUFFIX}/${base}.disabled`;
        await client.renameFile(c.server.id, from, to);
      } else {
        const from = `/${dir}/${DISABLED_SUFFIX}/${base}.disabled`;
        const to = `/${dir}/${base}`;
        await client.renameFile(c.server.id, from, to);
      }
      moved.push(base);
    } catch (e: any) {
      failed.push({ file: base, error: e?.message ?? "move failed" });
    }
  }

  await audit(`mod-doctor.${action}`, {
    userId: user.id,
    serverId: c.server.id,
    metadata: { dir, moved, failed: failed.map((f) => f.file) },
  });

  if (moved.length === 0 && failed.length > 0) {
    throw new HttpError(422, `Could not ${action} ${failed[0].file}: ${failed[0].error}`);
  }

  return json({ ok: true, action, moved, failed });
});
