import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertScope } from "@/lib/access";
import { DaemonClient } from "@/lib/daemon";
import { audit } from "@/lib/audit";
import { emitWebhook } from "@/lib/webhooks";

const schema = z.object({
  action: z.enum(["start", "stop", "restart", "kill"]),
  /** redémarrage avec préavis : compte à rebours in-game (secondes) avant le restart */
  warnSeconds: z.number().int().min(1).max(600).optional(),
});

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  const body = schema.parse(await req.json());
  const { action } = body;
  assertScope(c, action === "start" ? "control.start" : "control.stop");
  // A suspended server may be stopped/killed but not (re)started.
  if ((action === "start" || action === "restart") && c.server.suspended) {
    throw new HttpError(403, "This server is suspended — starting it is disabled.");
  }

  if (action === "restart" && body.warnSeconds) {
    // Préavis : le daemon diffuse un compte à rebours (RCON) puis redémarre.
    await new DaemonClient(c.node).restartWithWarning(c.server.id, body.warnSeconds);
  } else {
    await new DaemonClient(c.node).power(c.server.id, action);
  }

  const optimistic = action === "start" || action === "restart" ? "starting" : "stopping";
  await db.server.update({ where: { id: c.server.id }, data: { state: optimistic } });
  await audit("server.power", { userId: user.id, serverId: c.server.id, metadata: { action } });
  const evt = action === "start" ? "server.started" : action === "restart" ? "server.restarted" : "server.stopped";
  await emitWebhook(evt, { serverId: c.server.id, name: c.server.name, action }, { serverId: c.server.id, ownerId: c.server.ownerId });
  return json({ ok: true });
});
