import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, noContent, route } from "@/lib/http";
import { getServerContext, assertScope, assertNotSuspended } from "@/lib/access";
import { buildServerSpec } from "@/lib/spec";
import { DaemonClient } from "@/lib/daemon";
import { isSteamConfigured, getItemDetails, parseWorkshopId, type WorkshopItem } from "@/lib/steam-workshop";
import { audit } from "@/lib/audit";

const LUA_PATH = "garrysmod/lua/autorun/server/mgg_workshop.lua";

function parseList(v?: string): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function buildLua(addons: string[], maps: string[]): string {
  const ids = [...new Set([...addons, ...maps])];
  const body = ids.map((id) => `  resource.AddWorkshop("${id}")`).join("\n");
  return [
    "-- Managed by MGG - do not edit by hand.",
    "-- Tells joining clients to download this server's Workshop addons & maps.",
    "if SERVER then",
    body,
    "end",
    "",
  ].join("\n");
}

async function apply(serverId: string, env: Record<string, string>) {
  const updated = await db.server.update({
    where: { id: serverId },
    data: { environment: env as object },
    include: { allocations: true, node: true },
  });
  const daemon = new DaemonClient(updated.node);
  // Push the client-download manifest into the server's Lua autorun folder.
  // Best-effort: the collection mount still works through GAME_PARAMS if this fails.
  try {
    await daemon.writeFile(serverId, LUA_PATH, buildLua(parseList(env.WORKSHOP_ADDONS), parseList(env.WORKSHOP_MAPS)));
  } catch {
    /* ignore */
  }
  // Re-register the spec WITHOUT rebuilding so a running server picks up the new
  // collection/launch params on its next restart instead of being force-recreated.
  await daemon.registerServer(buildServerSpec(updated, updated.allocations), false);
}

export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.read");
  const env = (c.server.environment as Record<string, string>) ?? {};
  const addons = parseList(env.WORKSHOP_ADDONS);
  const maps = parseList(env.WORKSHOP_MAPS);
  let items: WorkshopItem[];
  try {
    items = await getItemDetails([...addons, ...maps]);
  } catch {
    items = [...addons, ...maps].map((id) => ({ id, title: `Item ${id}`, preview: null, kind: maps.includes(id) ? "map" : "addon" }));
  }
  const byId = new Map(items.map((i) => [i.id, i]));
  const resolve = ( list: string[], kind: "addon" | "map") =>
    list.map((id) => byId.get(id) ?? { id, title: `Item ${id}`, preview: null, kind });
  return json({
    addons: resolve(addons, "addon"),
    maps: resolve(maps, "map"),
    collection: env.WORKSHOP_COLLECTION || null,
    searchEnabled: isSteamConfigured(),
  });
});

const addSchema = z.object({ id: z.string().min(1).max(60), kind: z.enum(["addon", "map"]) });

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.update");
  assertNotSuspended(c);
  const parsed = addSchema.parse(await req.json());
  const id = parseWorkshopId(parsed.id);
  if (!id) throw new HttpError(400, "Enter a Workshop item ID or URL.");
  const details = await getItemDetails([id]).catch(() => [] as WorkshopItem[]);
  if (details.length === 0) throw new HttpError(422, `Workshop item ${id} was not found, or it isn't a Garry's Mod item.`);

  const env = { ...((c.server.environment as Record<string, string>) ?? {}) };
  const key = parsed.kind === "map" ? "WORKSHOP_MAPS" : "WORKSHOP_ADDONS";
  const set = new Set(parseList(env[key]));
  set.add(id);
  env[key] = [...set].join(",");
  await apply(c.server.id, env);
  await audit("workshop.add", { userId: user.id, serverId: c.server.id, metadata: { id, kind: parsed.kind } });
  return json({ ok: true, id, kind: parsed.kind, item: details[0] });
});

const collectionSchema = z.object({ collection: z.string().max(60) });

export const PUT = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.update");
  assertNotSuspended(c);
  const { collection } = collectionSchema.parse(await req.json());
  const env = { ...((c.server.environment as Record<string, string>) ?? {}) };
  env.WORKSHOP_COLLECTION = collection ? parseWorkshopId(collection) ?? "" : "";
  await apply(c.server.id, env);
  return json({ ok: true, collection: env.WORKSHOP_COLLECTION || null });
});

export const DELETE = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.update");
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return noContent();
  const env = { ...((c.server.environment as Record<string, string>) ?? {}) };
  env.WORKSHOP_ADDONS = parseList(env.WORKSHOP_ADDONS).filter((x) => x !== id).join(",");
  env.WORKSHOP_MAPS = parseList(env.WORKSHOP_MAPS).filter((x) => x !== id).join(",");
  await apply(c.server.id, env);
  return noContent();
});
