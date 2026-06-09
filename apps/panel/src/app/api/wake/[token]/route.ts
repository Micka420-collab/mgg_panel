import { db } from "@/lib/db";
import { route, json } from "@/lib/http";
import { HttpError } from "@/lib/auth";
import { DaemonClient } from "@/lib/daemon";
import { getTemplate, buildAddress } from "@mgg/shared";

async function resolveLink(token: string) {
  const link = await db.wakeLink.findUnique({
    where: { token },
    include: { server: { include: { node: true, allocations: true } } },
  });
  if (!link) throw new HttpError(404, "Wake link not found");
  if (link.expiresAt && link.expiresAt < new Date()) throw new HttpError(410, "Wake link expired");
  if (link.maxUses && link.uses >= link.maxUses) throw new HttpError(429, "Wake link exhausted");
  return link;
}

// Public, no-auth status for the wake page.
export const GET = route(async (_req, ctx: { params: { token: string } }) => {
  const link = await resolveLink(ctx.params.token);
  const s = link.server;
  const tpl = getTemplate(s.templateId);
  const primary = s.allocations.find((a) => a.primary) ?? s.allocations[0];
  const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;
  let state = s.state;
  try {
    state = (await new DaemonClient(s.node).status(s.id)).state;
  } catch {
    /* cached */
  }
  return json({
    name: s.name,
    game: s.game,
    icon: tpl?.icon ?? "🎮",
    state,
    address: primary ? buildAddress(primary.ip, primary.port, defaultPort) : null,
  });
});

// Public, no-auth, START-ONLY trigger.
export const POST = route(async (_req, ctx: { params: { token: string } }) => {
  const link = await resolveLink(ctx.params.token);
  const s = link.server;
  try {
    await new DaemonClient(s.node).power(s.id, "start");
    await db.server.update({ where: { id: s.id }, data: { state: "starting" } });
  } catch (e: any) {
    throw new HttpError(502, `Could not start the server: ${e?.message}`);
  }
  await db.wakeLink.update({ where: { id: link.id }, data: { uses: { increment: 1 } } });
  return json({ ok: true, state: "starting" });
});
