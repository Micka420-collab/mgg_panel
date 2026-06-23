// i18n configuration — locales available in the MGG panel.
export const locales = ["fr", "en", "uk", "zh"] as const;
export type Locale = (typeof locales)[number];

// Default locale (the panel ships in French; others are available via the switcher).
export const defaultLocale: Locale = "fr";

export const localeNames: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  uk: "Українська",
  zh: "中文",
};

export const localeFlags: Record<Locale, string> = {
  fr: "🇫🇷",
  en: "🇬🇧",
  uk: "🇺🇦",
  zh: "🇨🇳",
};

export const LOCALE_COOKIE = "locale";

export function isLocale(value: string | undefined | null): value is Locale {
  return !!value && (locales as readonly string[]).includes(value);
}
