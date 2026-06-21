import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, noContent, route } from "@/lib/http";
import { getServerContext, assertScope } from "@/lib/access";
import { DaemonClient } from "@/lib/daemon";
import { buildServerSpec } from "@/lib/spec";
import { getTemplate, buildAddress, validateVariable } from "@mgg/shared";
import { fqdnFor, isDnsConfigured } from "@/lib/dns";
import { audit } from "@/lib/audit";

export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  const tpl = getTemplate(c.server.templateId);

  // Clone lineage (for the "Push to origin" action on cloned servers).
  const clonedFrom = c.server.clonedFromId
    ? await db.server.findUnique({ where: { id: c.server.clonedFromId }, select: { id: true, name: true } })
    : null;
  const cloneCount = await db.server.count({ where: { clonedFromId: c.server.id } });

  let status: unknown = { state: c.server.state, stats: null, players: null };
  try {
    status = await new DaemonClient(c.node).status(c.server.id);
  } catch {
    /* node unreachable -> fall back to cached state */
  }

  const envValues = (c.server.environment as Record<string, string>) ?? {};
  const variables = (tpl?.variables ?? [])
    .filter((v) => v.userViewable)
    .map((v) => ({
      key: v.key,
      name: v.name,
      description: v.description,
      type: v.type,
      options: v.options,
      group: v.group ?? "General",
      editable: v.userEditable,
      value: envValues[v.key] ?? v.default,
    }));

  const primary = c.allocations.find((a) => a.primary) ?? c.allocations[0];
  const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;

  return json({
    server: {
      id: c.server.id,
      name: c.server.name,
      description: c.server.description,
      game: c.server.game,
      templateId: c.server.templateId,
      templateName: tpl?.name ?? c.server.templateId,
      icon: tpl?.icon ?? "🎮",
      color: tpl?.color ?? "#00B4D8",
      dockerImage: c.server.dockerImage,
      memoryMb: c.server.memoryMb,
      cpuPercent: c.server.cpuPercent,
      diskMb: c.server.diskMb,
      suspended: c.server.suspended,
      autoStop: c.server.autoStop,
      autoRestart: c.server.autoRestart,
      idleTimeout: c.server.idleTimeout,
      subdomain: c.server.subdomain,
      domain: c.server.subdomain && isDnsConfigured() ? fqdnFor(c.server.subdomain) : null,
      address:
        c.server.subdomain && isDnsConfigured()
          ? fqdnFor(c.server.subdomain)
          : primary
            ? buildAddress(primary.ip, primary.port, defaultPort)
            : null,
      clonedFrom, // { id, name } | null — the origin this server was cloned from
      cloneCount, // how many clones point at this server
      createdAt: c.server.createdAt,
    },
    node: { name: c.node.name, fqdn: c.node.fqdn, publicIp: c.node.publicIp },
    features: tpl?.features ?? [],
    allocations: c.allocations.map((a) => ({ id: a.id, ip: a.ip, port: a.port, protocol: a.protocol, role: a.role, primary: a.primary })),
    variables,
    status,
    scopes: c.scopes,
    isOwner: c.isOwner,
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

export const PATCH = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  const body = patchSchema.parse(await req.json());
  const tpl = getTemplate(c.server.templateId);

  const data: Record<string, unknown> = {};
  let rebuild = false;
  if (body.name !== undefined) {
    assertScope(c, "settings.rename");
    data.name = body.name;
  }
  if (body.description !== undefined) data.description = body.description;
  if (body.autoStop !== undefined) {
    data.autoStop = body.autoStop;
    rebuild = true; // autoStop changes the proxied flag → rebuild the spec
  }
  if (body.autoRestart !== undefined) data.autoRestart = body.autoRestart;
  if (body.idleTimeout !== undefined) data.idleTimeout = body.idleTimeout;

  if (body.variables && tpl) {
    assertScope(c, "startup.update");
    const env = { ...(c.server.environment as Record<string, string>) };
    for (const [key, value] of Object.entries(body.variables)) {
      const def = tpl.variables.find((v) => v.key === key);
      if (!def || !def.userEditable) continue; // ignore non-editable / unknown
      const err = validateVariable(def, value);
      if (err) throw new HttpError(422, err);
      env[key] = value;
    }
    data.environment = env as object;
    rebuild = true;
  }

  const updated = await db.server.update({
    where: { id: c.server.id },
    data,
    include: { allocations: true },
  });

  if (rebuild) {
    // Persist the new spec on the node without recreating the container; the new
    // variables/flags apply on the next start (so saving settings never kills a
    // running server).
    try {
      await new DaemonClient(c.node).registerServer(buildServerSpec(updated, updated.allocations), false);
    } catch (e: any) {
      throw new HttpError(502, `Saved, but the node could not be updated: ${e?.message}`);
    }
  }

  await audit("server.update", { userId: user.id, serverId: c.server.id, metadata: { rebuild } });
  // restartNeeded: les changements affectant le spec (variables / autoStop) ne prennent effet
  // qu'apres reconstruction du conteneur → l'UI peut proposer un redemarrage immediat
  // au lieu de laisser l'utilisateur croire que rien ne s'applique.
  return json({ ok: true, restartNeeded: rebuild });
});

export const DELETE = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  if (!c.isOwner) throw new HttpError(403, "Only the owner can delete a server");

  try {
    await new DaemonClient(c.node).destroy(c.server.id, true);
  } catch {
    /* node may be offline; remove our records regardless */
  }
  await db.server.delete({ where: { id: c.server.id } });
  await audit("server.delete", { userId: user.id, metadata: { serverId: c.server.id } });
  return noContent();
});
