import "server-only";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { getMessages, translate, type Messages, type TFunction } from "./index";

// Resolve the active locale on the server: explicit cookie → Accept-Language → default (fr).
export function getLocale(): Locale {
  const cookieLocale = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  const accept = (headers().get("accept-language") ?? "").toLowerCase();
  if (accept.startsWith("en")) return "en";
  if (accept.startsWith("fr")) return "fr";
  return defaultLocale;
}

export function getServerI18n(): { locale: Locale; messages: Messages; t: TFunction } {
  const locale = getLocale();
  const messages = getMessages(locale);
  return { locale, messages, t: (key, vars) => translate(messages, key, vars) };
}
