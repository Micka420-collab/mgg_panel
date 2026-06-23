import { requireUser, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { DaemonClient } from "@/lib/daemon";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/restart — restart the panel container to apply a pulled
 * update (or recover it). Admin-only. The node co-located with the panel
 * actually restarts it; other game nodes have no panel and no-op.
 */
export const POST = route(async () => {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new HttpError(403, "Only an admin can restart the panel");

  await audit("platform.restart", { userId: user.id, metadata: {} }).catch(() => {});

  const nodes = await db.node.findMany();
  const results = await Promise.allSettled(nodes.map((n) => new DaemonClient(n).restartPanel()));
  const triggered = results.filter((r) => r.status === "fulfilled").length;
  if (triggered === 0) throw new HttpError(502, "No node accepted the restart — is a daemon reachable?");

  return json({ ok: true, triggered });
});
