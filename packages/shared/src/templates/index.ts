import type { GameTemplate } from "./template.js";
import { minecraftJava, minecraftBedrock } from "./minecraft.js";
import { icarus } from "./icarus.js";
import { valheim, palworld, rust } from "./extra.js";
import { terraria } from "./terraria.js";
import { garrysmod } from "./garrysmod.js";
import { teamFortress2, counterStrike2 } from "./source.js";
import { teamspeak, mumble } from "./voice.js";
import { velocityProxy, bungeeProxy } from "./velocity.js";
import { fivem } from "./fivem.js";
import { mysql, mariadb, postgres, redis } from "./database.js";
import { nginxStatic, wordpress } from "./webhosting.js";
import { n8n, uptimeKuma, vaultwarden, nextcloud } from "./apps.js";

export * from "./template.js";

/** Every built-in template, in catalog display order. */
export const TEMPLATES: GameTemplate[] = [
  minecraftJava,
  minecraftBedrock,
  velocityProxy,
  bungeeProxy,
  icarus,
  fivem,
  valheim,
  palworld,
  rust,
  terraria,
  garrysmod,
  teamFortress2,
  counterStrike2,
  teamspeak,
  mumble,
  // ── Hébergement : bases de données ──
  mysql,
  mariadb,
  postgres,
  redis,
  // ── Hébergement : web ──
  nginxStatic,
  wordpress,
  // ── Hébergement : apps / SaaS ──
  n8n,
  uptimeKuma,
  vaultwarden,
  nextcloud,
];

/** Display metadata for each catalog category (labels, icons, order, grouping). */
export interface CategoryMeta {
  key: GameTemplate["category"];
  label: string;
  icon: string;
  /** high-level group shown as a section in the catalog */
  group: "Jeux" | "Hébergement";
  order: number;
}
export const CATEGORIES: CategoryMeta[] = [
  { key: "minecraft", label: "Minecraft", icon: "🟩", group: "Jeux", order: 0 },
  { key: "survival", label: "Survie", icon: "🌍", group: "Jeux", order: 1 },
  { key: "sandbox", label: "Bac à sable", icon: "🧱", group: "Jeux", order: 2 },
  { key: "shooter", label: "FPS / Shooter", icon: "🎯", group: "Jeux", order: 3 },
  { key: "other", label: "Autres jeux & voix", icon: "🎮", group: "Jeux", order: 4 },
  { key: "database", label: "Bases de données", icon: "🗄️", group: "Hébergement", order: 5 },
  { key: "web", label: "Hébergement web", icon: "🌐", group: "Hébergement", order: 6 },
  { key: "app", label: "Apps & SaaS", icon: "🚀", group: "Hébergement", order: 7 },
];
export function categoryMeta(key: string): CategoryMeta {
  return CATEGORIES.find((c) => c.key === key) ?? { key: "other", label: "Autres", icon: "📦", group: "Jeux", order: 99 };
}

const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.id, t]));

export function getTemplate(id: string): GameTemplate | undefined {
  return TEMPLATE_MAP.get(id);
}

export function requireTemplate(id: string): GameTemplate {
  const t = TEMPLATE_MAP.get(id);
  if (!t) throw new Error(`Unknown game template: ${id}`);
  return t;
}

export function templatesByGame(game: string): GameTemplate[] {
  return TEMPLATES.filter((t) => t.game === game);
}

/** Distinct games for the catalog, with their template count. */
export interface GameSummary {
  game: string;
  name: string;
  icon: string;
  color: string;
  templates: number;
}

export function listGames(): GameSummary[] {
  const seen = new Map<string, GameSummary>();
  for (const t of TEMPLATES) {
    const existing = seen.get(t.game);
    if (existing) {
      existing.templates += 1;
    } else {
      seen.set(t.game, {
        game: t.game,
        name: t.name.split(":")[0]!.trim(),
        icon: t.icon,
        color: t.color,
        templates: 1,
      });
    }
  }
  return [...seen.values()];
}
