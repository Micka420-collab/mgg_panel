"use client";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { locales, localeNames, localeFlags, LOCALE_COOKIE, type Locale } from "@/i18n/config";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/util";

/** Compact FR/EN switcher: writes the `locale` cookie and refreshes server components. */
export function LanguageSwitcher() {
  const router = useRouter();
  const { locale, t } = useT();

  function pick(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] uppercase tracking-wide text-white/35">
        <Globe className="h-3 w-3" /> {t("language.label")}
      </div>
      <div className="flex gap-1">
        {locales.map((l) => (
          <button
            key={l}
            onClick={() => pick(l)}
            aria-pressed={l === locale}
            className={cn(
              "flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition",
              l === locale
                ? "bg-white/10 text-white"
                : "text-white/45 hover:bg-white/5 hover:text-white",
            )}
          >
            {localeFlags[l]} {localeNames[l]}
          </button>
        ))}
      </div>
    </div>
  );
}
