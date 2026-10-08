import "server-only";
import { memoryReductionError } from "@mgg/shared";
import type { ServerContext } from "./access";
import { assertNotSuspended } from "./access";
import { HttpError } from "./auth";
import { db } from "./db";
import { DaemonClient } from "./daemon";
import { buildServerSpec } from "./spec";
import { audit } from "./audit";

export async function reduceServerMemory(c: ServerContext, memoryMb: number, userId: string) {
  if (!c.isOwner) throw new HttpError(403, "Only the owner or an administrator can change server RAM.");
  assertNotSuspended(c);
  const node = new DaemonClient(c.node);
  // Require an actual node response. A stale cached 'offline' flag is insufficient.
  const current = await node.status(c.server.id);
  const error = memoryReductionError(c.server.memoryMb, memoryMb, current.state);
  if (error) throw new HttpError(409, error);
  const changed = await db.server.updateMany({
    where: { id: c.server.id, memoryMb: c.server.memoryMb }, data: { memoryMb }
  });
  if (changed.count !== 1) throw new HttpError(409, "Server RAM changed; reload before trying again.");
  const updated = await db.server.findUniqueOrThrow({ where: { id: c.server.id }, include: { allocations: true } });
  try {
    await node.registerServer(buildServerSpec(updated, updated.allocations), false);
  } catch (error) {
    await db.server.updateMany({ where: { id: c.server.id, memoryMb }, data: { memoryMb: c.server.memoryMb } });
    throw error;
  }
  await audit("server.memory", { userId, serverId: c.server.id,
    metadata: { fromMb: c.server.memoryMb, toMb: memoryMb } });
  return { ok: true, memoryMb, previousMemoryMb: c.server.memoryMb };
}
