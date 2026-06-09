"use client";
import { createContext, useContext, useMemo } from "react";
import type { Locale } from "./config";
import { translate, type Messages, type TFunction } from "./index";

interface I18nValue {
  locale: Locale;
  t: TFunction;
}

const I18nContext = createContext<I18nValue>({ locale: "fr", t: (k) => k });

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nValue>(
    () => ({ locale, t: (key, vars) => translate(messages, key, vars) }),
    [locale, messages],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Client-component translation hook: `const { t, locale } = useT();` then `t("nav.servers")`. */
export function useT(): I18nValue {
  return useContext(I18nContext);
}
