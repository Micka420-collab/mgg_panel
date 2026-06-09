import { z } from "zod";
import { db } from "@/lib/db";
import { route, json } from "@/lib/http";
import { HttpError } from "@/lib/auth";
import { authApi, requireApiScope } from "@/lib/api-auth";
import { getServerContext, assertScope, assertNotSuspended } from "@/lib/access";
import { DaemonClient } from "@/lib/daemon";
import { buildServerSpec } from "@/lib/spec";
import { getTemplate, buildAddress, validateVariable, hasScope } from "@mgg/shared";

export const GET = route(async (req: Request, ctx: { params: { id: string } }) => {
  const principal = await authApi(req);
  requireApiScope(principal, "allocation.read");
  const c = await getServerContext(principal.user, ctx.params.id);
  const tpl = getTemplate(c.server.templateId);
  const env = (c.server.environment as Record<string, string>) ?? {};
  const primary = c.allocations.find((a) => a.primary) ?? c.allocations[0];
  const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;

  // live state from the node (falls back to cached)
  let state = c.server.state as string;
  try {
    state = (await new DaemonClient(c.node).status(c.server.id)).state;
  } catch {
    /* node offline */
  }

  // startup variable VALUES are sensitive — only expose them with startup.read
  const showVars = hasScope(principal.scopes, "startup.read");

  return json({
    id: c.server.id,
    name: c.server.name,
    game: c.server.game,
    template: c.server.templateId,
    state,
    memoryMb: c.server.memoryMb,
    cpuPercent: c.server.cpuPercent,
    diskMb: c.server.diskMb,
    autoStop: c.server.autoStop,
    autoRestart: c.server.autoRestart,
    idleTimeout: c.server.idleTimeout,
    address: primary ? buildAddress(primary.ip, primary.port, defaultPort) : null,
    allocations: c.allocations.map((a) => ({ ip: a.ip, port: a.port, protocol: a.protocol, role: a.role, primary: a.primary })),
    variables: showVars
      ? (tpl?.variables ?? []).filter((v) => v.userViewable).map((v) => ({ key: v.key, value: env[v.key] ?? v.default }))
      : undefined,
  });
});

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  description: z.string().max(300).optional(),
  variables: z.record(z.string()).optional(),
  autoStop: z.boolean().optional(),
  autoRestart: z.boolean().optional(),
  idleTimeout: z.number().int().min(60).max(86400).optional(),
});

// PATCH — update settings / startup variables (applies on next start; never kills a running server).
export const PATCH = route(async (req: Request, ctx: { params: { id: string } }) => {
  const principal = await authApi(req);
  const c = await getServerContext(principal.user, ctx.params.id);
  const body = patchSchema.parse(await req.json());
  const tpl = getTemplate(c.server.templateId);
  assertNotSuspended(c);

  const data: Record<string, unknown> = {};
  let rebuild = false;

  if (body.name !== undefined) {
    requireApiScope(principal, "settings.rename");
    assertScope(c, "settings.rename");
    data.name = body.name;
  }

  const touchesConfig =
    body.description !== undefined ||
    body.autoStop !== undefined ||
    body.autoRestart !== undefined ||
    body.idleTimeout !== undefined ||
    body.variables !== undefined;
  if (touchesConfig) {
    requireApiScope(principal, "startup.update");
    assertScope(c, "startup.update");
  }
  if (body.description !== undefined) data.description = body.description;
  if (body.autoStop !== undefined) {
    data.autoStop = body.autoStop;
    rebuild = true; // proxied flag changes
  }
  if (body.autoRestart !== undefined) data.autoRestart = body.autoRestart;
  if (body.idleTimeout !== undefined) data.idleTimeout = body.idleTimeout;

  if (body.variables && tpl) {
    const merged = { ...(c.server.environment as Record<string, string>) };
    for (const [key, value] of Object.entries(body.variables)) {
      const def = tpl.variables.find((v) => v.key === key);
      if (!def || !def.userEditable) continue; // ignore unknown / non-editable
      const err = validateVariable(def, value);
      if (err) throw new HttpError(422, err);
      merged[key] = value;
    }
    data.environment = merged as object;
    rebuild = true;
  }

  const updated = await db.server.update({ where: { id: c.server.id }, data, include: { allocations: true } });
  if (rebuild) {
    // persist the new spec on the node (no rebuild — applies on next start)
    await new DaemonClient(c.node).registerServer(buildServerSpec(updated, updated.allocations), false);
  }
  return json({ ok: true });
});
