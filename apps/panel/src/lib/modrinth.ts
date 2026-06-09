import "server-only";

const UA = "MGG-Panel/1.0 (self-hosted game hosting)";
const API = "https://api.modrinth.com/v2";

/** Map an itzg TYPE to a Modrinth loader facet value. */
const LOADER_MAP: Record<string, string> = {
  PAPER: "paper",
  PURPUR: "purpur",
  SPIGOT: "spigot",
  BUKKIT: "bukkit",
  FABRIC: "fabric",
  FORGE: "forge",
  NEOFORGE: "neoforge",
  QUILT: "quilt",
};

const PLUGIN_LOADERS = new Set(["paper", "purpur", "spigot", "bukkit"]);

export interface ModHit {
  projectId: string;
  slug: string;
  title: string;
  description: string;
  icon: string | null;
  downloads: number;
  follows: number;
  author: string;
  projectType: string;
  categories: string[];
}

export interface ModSearchContext {
  loader: string | null;
  version: string | null;
  /** project type appropriate for this server: "mod" | "plugin" | "modpack" */
  defaultType: "mod" | "plugin" | "modpack";
}

export function modContext(env: Record<string, string>): ModSearchContext {
  const loader = LOADER_MAP[(env.TYPE ?? "").toUpperCase()] ?? null;
  const version = env.VERSION && !["LATEST", "SNAPSHOT", ""].includes(env.VERSION) ? env.VERSION : null;
  const defaultType = loader && PLUGIN_LOADERS.has(loader) ? "plugin" : "mod";
  return { loader, version, defaultType };
}

// Plugin loaders are cross-compatible (a Paper server runs Spigot/Bukkit plugins,
// Purpur runs Paper, etc.). When checking compatibility we accept any member of
// the family so a plugin tagged only "spigot" still counts as Paper-compatible.
const PLUGIN_FAMILY: Record<string, string[]> = {
  paper: ["paper", "purpur", "folia", "spigot", "bukkit"],
  purpur: ["purpur", "paper", "folia", "spigot", "bukkit"],
  spigot: ["spigot", "bukkit", "paper"],
  bukkit: ["bukkit", "spigot", "paper"],
};
function loaderFamily(loader: string | null): string[] | null {
  if (!loader) return null;
  return PLUGIN_FAMILY[loader] ?? [loader];
}

// itzg accepts release+beta builds (we set MODRINTH_ALLOWED_VERSION_TYPE=beta),
// which matters right after a Minecraft release when plugins only ship betas.
const ALLOWED_VERSION_TYPES = new Set(["release", "beta"]);

// ── resolve the effective Minecraft version (LATEST/SNAPSHOT → a real number) ──
let gameVersionCache: { at: number; release: string | null; snapshot: string | null } | null = null;
async function latestGameVersions() {
  if (gameVersionCache && Date.now() - gameVersionCache.at < 3_600_000) return gameVersionCache;
  try {
    const res = await fetch(`${API}/tag/game_version`, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const list = (await res.json()) as { version: string; version_type: string }[];
    const release = list.find((v) => v.version_type === "release")?.version ?? null;
    gameVersionCache = { at: Date.now(), release, snapshot: list[0]?.version ?? release };
  } catch {
    gameVersionCache = { at: Date.now(), release: null, snapshot: null };
  }
  return gameVersionCache;
}

/** Turn a server's VERSION (which may be LATEST/SNAPSHOT/"") into a concrete game version. */
export async function resolveGameVersion(raw?: string): Promise<string | null> {
  const v = (raw ?? "").trim();
  if (v && !["LATEST", "SNAPSHOT"].includes(v.toUpperCase())) return v;
  const g = await latestGameVersions();
  return v.toUpperCase() === "SNAPSHOT" ? g.snapshot ?? g.release : g.release;
}

export interface ModVersion {
  id: string;
  name: string;
  versionNumber: string;
  gameVersions: string[];
  loaders: string[];
  versionType: string;
  datePublished: string;
}

/** Versions of a project, optionally filtered (server-side) by loader family + game version. */
export async function projectVersions(
  idOrSlug: string,
  loader: string | null,
  gameVersion: string | null,
): Promise<ModVersion[]> {
  const url = new URL(`${API}/project/${encodeURIComponent(idOrSlug)}/version`);
  const fam = loaderFamily(loader);
  if (fam) url.searchParams.set("loaders", JSON.stringify(fam));
  if (gameVersion) url.searchParams.set("game_versions", JSON.stringify([gameVersion]));
  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (res.status === 404) throw new Error(`"${idOrSlug}" was not found on Modrinth`);
  if (!res.ok) throw new Error(`Modrinth lookup failed (${res.status})`);
  const data = (await res.json()) as any[];
  return data.map((v) => ({
    id: v.id,
    name: v.name,
    versionNumber: v.version_number,
    gameVersions: v.game_versions ?? [],
    loaders: v.loaders ?? [],
    versionType: v.version_type,
    datePublished: v.date_published,
  }));
}

export interface CompatResult {
  compatible: boolean;
  /** installable versions (loader+gameVersion, release/beta) newest-first */
  versions: ModVersion[];
  /** when incompatible: the game versions the project DOES support (for messaging) */
  supportedGameVersions: string[];
  /** true if a build exists but only as alpha (we don't auto-install those) */
  onlyAlpha: boolean;
}

/** Does this project have an installable build for the server's loader + MC version? */
export async function checkCompatibility(
  idOrSlug: string,
  loader: string | null,
  gameVersion: string | null,
): Promise<CompatResult> {
  const matching = await projectVersions(idOrSlug, loader, gameVersion);
  const installable = matching.filter((v) => ALLOWED_VERSION_TYPES.has(v.versionType));
  if (installable.length > 0) {
    return { compatible: true, versions: installable, supportedGameVersions: [], onlyAlpha: false };
  }
  const onlyAlpha = matching.length > 0; // had a build, but only alpha
  // Gather the versions it DOES support (loader-filtered) so we can tell the user.
  const all = await projectVersions(idOrSlug, loader, null).catch(() => [] as ModVersion[]);
  const supported = [...new Set(all.flatMap((v) => v.gameVersions))];
  return { compatible: false, versions: [], supportedGameVersions: supported, onlyAlpha };
}

export async function searchModrinth(
  query: string,
  opts: { type: "mod" | "plugin" | "modpack"; loader: string | null; version: string | null; limit?: number },
): Promise<ModHit[]> {
  const facets: string[][] = [[`project_type:${opts.type}`]];
  if (opts.loader && opts.type !== "modpack") facets.push([`categories:${opts.loader}`]);
  if (opts.version) facets.push([`versions:${opts.version}`]);

  const url = new URL(`${API}/search`);
  url.searchParams.set("query", query);
  url.searchParams.set("limit", String(opts.limit ?? 20));
  url.searchParams.set("index", query ? "relevance" : "downloads");
  url.searchParams.set("facets", JSON.stringify(facets));

  const res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
  if (!res.ok) throw new Error(`Modrinth search failed (${res.status})`);
  const data = (await res.json()) as { hits: any[] };
  return data.hits.map((h) => ({
    projectId: h.project_id,
    slug: h.slug,
    title: h.title,
    description: h.description,
    icon: h.icon_url || null,
    downloads: h.downloads ?? 0,
    follows: h.follows ?? 0,
    author: h.author ?? "",
    projectType: h.project_type,
    categories: h.categories ?? [],
  }));
}
