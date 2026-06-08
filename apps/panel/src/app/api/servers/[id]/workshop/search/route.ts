import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext, assertScope } from "@/lib/access";
import { searchWorkshop, isSteamConfigured } from "@/lib/steam-workshop";

export const dynamic = "force-dynamic";

export const GET = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.read");
  if (!isSteamConfigured()) return json({ hits: [], error: "Steam Workshop search is not configured." });
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const kind = (url.searchParams.get("kind") as "addon" | "map") || "addon";
  const hits = await searchWorkshop({ q, kind });
  return json({ hits });
});
