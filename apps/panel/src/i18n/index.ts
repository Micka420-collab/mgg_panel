import type { Locale } from "./config";
import en from "./messages/en";
import fr from "./messages/fr";

// English is the canonical/base dictionary — its shape defines the available keys.
export type Messages = typeof en;

const DICTS: Record<Locale, unknown> = { en, fr };

// Deep-merge so a missing key in a non-English dictionary falls back to the English string
// (never a raw key) — lets us translate incrementally without breaking the UI.
function deepMerge(base: any, over: any): any {
  if (!over) return base;
  const out: any = { ...base };
  for (const k of Object.keys(over)) {
    const ov = over[k];
    if (ov && typeof ov === "object" && !Array.isArray(ov) && base[k] && typeof base[k] === "object") {
      out[k] = deepMerge(base[k], ov);
    } else {
      out[k] = ov;
    }
  }
  return out;
}

export function getMessages(locale: Locale): Messages {
  if (locale === "en") return en;
  return deepMerge(en, DICTS[locale]) as Messages;
}

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

// Dot-path lookup + {var} interpolation. Falls back to the key if not a string.
export function translate(messages: unknown, key: string, vars?: Record<string, string | number>): string {
  const val = key
    .split(".")
    .reduce<any>((acc, part) => (acc && typeof acc === "object" ? acc[part] : undefined), messages);
  if (typeof val !== "string") return key;
  if (!vars) return val;
  return val.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}
