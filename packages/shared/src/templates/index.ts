import type { GameTemplate } from "./template.js";
import { minecraftJava, minecraftBedrock } from "./minecraft.js";
import { icarus } from "./icarus.js";
import { valheim, palworld, rust } from "./extra.js";
import { garrysmod } from "./garrysmod.js";
import { velocityProxy } from "./velocity.js";
import { fivem } from "./fivem.js";

export * from "./template.js";

/** Every built-in template, in catalog display order. */
export const TEMPLATES: GameTemplate[] = [
  minecraftJava,
  minecraftBedrock,
  icarus,
  fivem,
  valheim,
  palworld,
  rust,
  garrysmod,
  velocityProxy,
];

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
