import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertNotSuspended } from "@/lib/access";
import { DaemonClient } from "@/lib/daemon";
import { randomString } from "@/lib/crypto";
import { audit } from "@/lib/audit";

// Overwriting a large volume can take a while; keep on the Node runtime.
export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * POST /api/servers/:id/push
 * Promote a cloned server's files onto its origin ("production"): the origin is
 * stopped, fully backed up (reversible — the backup appears in its Backups tab),
 * then its volume is overwritten with this clone's files. The origin keeps its own
 * ports / variables / identity. Owner-only; the origin is left stopped for review.
 */
export const POST = route(async (_req: Request, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id); // c.server = the clone
  if (!c.isOwner) throw new HttpError(403, "Only the owner can push to the origin server");
  assertNotSuspended(c);

  const dev = c.server;
  if (!dev.clonedFromId) throw new HttpError(422, "This server is not a clone — it has no origin to push to");

  const origin = await db.server.findUnique({ where: { id: dev.clonedFromId } });
  if (!origin) throw new HttpError(404, "The origin server no longer exists");
  if (origin.ownerId !== user.id && user.role !== "ADMIN")
    throw new HttpError(403, "You do not own the origin server");
  if (origin.nodeId !== dev.nodeId)
    throw new HttpError(409, "The clone and its origin are on different nodes");
  if (origin.suspended) throw new HttpError(403, "The origin server is suspended");

  const backupId = randomString(20);
  const backupName = `Before push from "${dev.name}"`;

  const result = await new DaemonClient(c.node).promote(dev.id, origin.id, backupId, backupName);

  // Record the safety backup so it surfaces in the origin's Backups tab.
  await db.backup.create({
    data: {
      id: backupId,
      serverId: origin.id,
      name: backupName,
      sizeBytes: BigInt(result.backup?.sizeBytes ?? 0),
      checksum: result.backup?.checksum ?? null,
      completed: true,
    },
  });

  // The origin was stopped for the overwrite — reflect that in the cached state.
  await db.server.update({ where: { id: origin.id }, data: { state: "offline" } });

  await audit("server.push", {
    userId: user.id,
    serverId: origin.id,
    metadata: { from: dev.id, files: result.files, backupId },
  });
  return json({ ok: true, originId: origin.id, originName: origin.name, files: result.files, backupId });
});
