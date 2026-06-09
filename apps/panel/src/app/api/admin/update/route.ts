import { requireUser, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { DaemonClient } from "@/lib/daemon";
import { audit } from "@/lib/audit";

/**
 * POST /api/admin/update — pull the latest code from GitHub and rebuild + restart
 * the panel & daemon. Admin-only. The node co-located with the stack runs the
 * actual update (other game nodes simply have nothing to rebuild and no-op).
 */
export const POST = route(async () => {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new HttpError(403, "Only an admin can update the platform");

  await audit("platform.self_update", { userId: user.id, metadata: {} }).catch(() => {});

  const nodes = await db.node.findMany();
  const results = await Promise.allSettled(nodes.map((n) => new DaemonClient(n).selfUpdate()));
  const triggered = results.filter((r) => r.status === "fulfilled").length;
  if (triggered === 0) throw new HttpError(502, "No node accepted the update — is a daemon reachable?");

  return json({ ok: true, triggered });
});
