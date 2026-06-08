import { env as appEnv } from "./env";

const APP_ID = "4000"; // Garry's Mod Workshop = the GAME app id 4000 (the dedicated-server SteamCMD app is 4020)

export interface WorkshopItem {
  id: string;
  title: string;
  preview: string | null;
  kind: "addon" | "map";
  subs?: number;
}

export function isSteamConfigured(): boolean {
  return !!appEnv.steamApiKey;
}

/** Accept a raw id, a full Workshop URL, or an "id - title" paste. */
export function parseWorkshopId(input: string): string | null {
  const s = (input ?? "").trim();
  const m = s.match(/[?&]id=(\d{4,})/) ?? s.match(/^(\d{4,})\b/);
  return m ? m[1]! : null;
}

function kindFromTags(tags: unknown): "addon" | "map" {
  const flat = (Array.isArray(tags) ? tags : [])
    .map((t: any) => (typeof t === "string" ? t : t?.tag))
    .map((t) => String(t ?? "").toLowerCase());
  return flat.includes("map") ? "map" : "addon";
}

/**
 * Public, key-less lookup of one or more published files. Used to validate an
 * item added by URL/ID and to resolve titles/thumbnails for installed items.
 */
export async function getItemDetails(ids: string[]): Promise<WorkshopItem[]> {
  const clean = ids.map((i) => i.trim()).filter((i) => /^\d+$/.test(i));
  if (clean.length === 0) return [];
  const body = new URLSearchParams();
  body.set("itemcount", String(clean.length));
  clean.forEach((id, i) => body.set(`publishedfileids[${i}]`, id));
  const res = await fetch("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Steam returned ${res.status}`);
  const data: any = await res.json();
  const files: any[] = data?.response?.publishedfiledetails ?? [];
  return files
    .filter((f) => f && f.result === 1 && String(f.consumer_app_id) === APP_ID)
    .map((f) => ({
      id: String(f.publishedfileid),
      title: f.title || `Item ${f.publishedfileid}`,
      preview: f.preview_url || null,
      kind: kindFromTags(f.tags),
      subs: f.subscriptions,
    }));
}

/** Search the Workshop for Garry's Mod items (requires a Steam Web API key). */
export async function searchWorkshop(opts: { q: string; kind: "addon" | "map"; page?: number }): Promise<WorkshopItem[]> {
  if (!appEnv.steamApiKey) throw new Error("Steam Workshop search is not configured (set STEAM_API_KEY).");
  const params = new URLSearchParams({
    key: appEnv.steamApiKey,
    appid: APP_ID,
    query_type: "0",
    numperpage: "50",
    page: String(opts.page ?? 1),
    search_text: opts.q ?? "",
    return_tags: "true",
    return_previews: "true",
  });
  const res = await fetch(`https://api.steampowered.com/IPublishedFileService/QueryFiles/v1/?${params.toString()}`);
  if (!res.ok) throw new Error(`Steam search returned ${res.status}`);
  const data: any = await res.json();
  const files: any[] = data?.response?.publishedfiledetails ?? [];
  return files
    .map((f) => ({
      id: String(f.publishedfileid),
      title: f.title || `Item ${f.publishedfileid}`,
      preview: f.preview_url || f.previews?.[0]?.url || null,
      kind: kindFromTags(f.tags),
      subs: f.subscriptions ?? f.lifetime_subscriptions,
    }))
    .filter((i) => i.kind === opts.kind);
}
