import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertScope, assertNotSuspended } from "@/lib/access";
import { createServer } from "@/lib/provision";
import { buildServerSpec } from "@/lib/spec";
import { DaemonClient } from "@/lib/daemon";
import { audit } from "@/lib/audit";

/**
 * Clone / branch a server.
 *
 * POST { name, fromBackupId? }
 *   - Duplicates the SOURCE server's config (templateId, game, dockerImage,
 *     resolved environment, memory/cpu/disk/swap, node) into a brand-new server
 *     with a fresh port allocation — by reusing the same `createServer`
 *     provisioning path the normal create-server flow uses.
 *   - The newly-provisioned server starts from template-default env; we then
 *     overwrite its environment with the SOURCE's EXACT resolved environment
 *     (so non-editable / generated values like RCON passwords carry over) and
 *     re-register the spec WITHOUT rebuilding (applies on first start).
 *   - If `fromBackupId` is given, we "branch from this point": the source's
 *     backup archive is extracted into the NEW server's volume on the node via
 *     the daemon's clone-from endpoint (a cross-server crash-safe restore).
 *     The config-clone always succeeds; the world-copy degrades gracefully —
 *     if the daemon can't copy the volume the clone is still returned with a
 *     `worldCopied: false` flag instead of failing the whole request.
 *
 * Auth: requires `backup.read` on the SOURCE server (you must be able to read
 * the source's data to fork it) and is owner/admin-gated for the actual create
 * via createServer (which provisions under the requesting user as the new owner).
 */

const schema = z.object({
  name: z.string().min(1).max(60),
  fromBackupId: z.string().min(1).optional(),
});

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const source = await getServerContext(user, ctx.params.id);
  // Forking copies the source's full config + (optionally) its world, so require
  // the ability to read its backups/data. Block forking a suspended server.
  assertScope(source, "backup.read");
  assertNotSuspended(source);

  const body = schema.parse(await req.json());

  // If a source backup was requested, validate it exists and is complete BEFORE
  // we provision anything (so we don't leave an orphan server on a bad id).
  let backup: { id: string } | null = null;
  if (body.fromBackupId) {
    const b = await db.backup.findFirst({
      where: { id: body.fromBackupId, serverId: source.server.id },
    });
    if (!b) throw new HttpError(404, "Source backup not found");
    if (!b.completed) throw new HttpError(409, "That backup is still in progress — wait for it to finish, then clone.");
    backup = { id: b.id };
  }

  const srcEnv = (source.server.environment as Record<string, string>) ?? {};

  // 1) Provision a brand-new server reusing the SAME create path (fresh ports,
  // node selection, daemon registration). We seed it with the source's env as
  // user variables so editable values are already correct; non-editable values
  // are reconciled in step 2.
  const clone = await createServer(user, {
    name: body.name,
    templateId: source.server.templateId,
    dockerImage: source.server.dockerImage,
    nodeId: source.server.nodeId, // keep the clone on the same node as its parent
    variables: srcEnv,
    limits: {
      memoryMb: source.server.memoryMb,
      cpuPercent: source.server.cpuPercent,
      diskMb: source.server.diskMb,
      swapMb: source.server.swapMb,
    },
  });

  // 2) Overwrite the clone's environment with the source's EXACT resolved
  // environment so generated/non-editable values (e.g. RCON password) match,
  // then re-register the corrected spec WITHOUT rebuilding (applies on start).
  const fresh = await db.server.update({
    where: { id: clone.id },
    // Record the lineage so the clone can later push its files back to this origin.
    data: { environment: srcEnv as object, clonedFromId: source.server.id },
    include: { allocations: true, node: true },
  });
  try {
    await new DaemonClient(fresh.node).registerServer(buildServerSpec(fresh, fresh.allocations), false);
  } catch {
    // Non-fatal: the env is persisted; the spec re-syncs on the next start/edit.
  }

  // 3) Optional world-copy: extract the source backup into the clone's volume
  // via the daemon's cross-server clone-from endpoint. Degrade gracefully.
  let worldCopied = false;
  let worldError: string | null = null;
  if (backup) {
    try {
      await cloneVolumeFromBackup(fresh.node, source.server.id, backup.id, fresh.id);
      worldCopied = true;
    } catch (e: any) {
      worldError = e?.message ?? "world copy failed";
    }
  }

  await audit("server.clone", {
    userId: user.id,
    serverId: fresh.id,
    metadata: { sourceServerId: source.server.id, fromBackupId: backup?.id ?? null, worldCopied },
  });

  return json({ id: fresh.id, worldCopied, worldError }, 201);
});

/**
 * Ask the source server's node to extract `backupId` (which lives under the
 * SOURCE server's backup dir) into the TARGET server's volume. Implemented as a
 * direct authenticated call to the daemon's clone-from route so we don't have to
 * widen the shared DaemonClient. Mirrors DaemonClient's bearer-token transport.
 */
async function cloneVolumeFromBackup(
  node: { scheme: string; fqdn: string; daemonPort: number; tokenSecret: string },
  sourceServerId: string,
  backupId: string,
  targetServerId: string,
): Promise<void> {
  const base = `${node.scheme}://${node.fqdn}:${node.daemonPort}`;
  const res = await fetch(`${base}/api/servers/${targetServerId}/clone-from`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${node.tokenSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sourceServerId, backupId }),
    cache: "no-store",
  });
  if (!res.ok) {
    let msg = `daemon ${res.status}`;
    try {
      msg = ((await res.json()) as { error?: string })?.error ?? msg;
    } catch {
      /* noop */
    }
    throw new Error(msg);
  }
}
