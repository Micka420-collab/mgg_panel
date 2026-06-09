import { z } from "zod";
import { requireUser, HttpError } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { DaemonClient } from "@/lib/daemon";
import { audit } from "@/lib/audit";

const CONFIRM_PHRASE = "DELETE EVERYTHING";

/**
 * POST /api/admin/destroy — wipe the ENTIRE MGG installation from the VM(s):
 * every server, all worlds/files/backups, the database and the platform stack
 * itself. Admin-only, gated behind a typed confirmation phrase. Irreversible.
 */
export const POST = route(async (req: Request) => {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new HttpError(403, "Only an admin can delete the installation");

  const { confirm } = z.object({ confirm: z.string() }).parse(await req.json());
  if (confirm !== CONFIRM_PHRASE) throw new HttpError(400, `Type "${CONFIRM_PHRASE}" to confirm.`);

  // Best-effort audit before the database is wiped along with everything else.
  await audit("platform.self_destruct", { userId: user.id, metadata: {} }).catch(() => {});

  const nodes = await db.node.findMany();
  const results = await Promise.allSettled(nodes.map((n) => new DaemonClient(n).selfDestruct()));
  const triggered = results.filter((r) => r.status === "fulfilled").length;

  return json({ ok: true, triggered, nodes: nodes.length });
});
