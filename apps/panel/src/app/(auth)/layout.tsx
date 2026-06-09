import { AmbientBackground } from "@/components/ambient";
import { Logo } from "@/components/logo";
import { I18nProvider } from "@/i18n/client";
import { getServerI18n } from "@/i18n/server";

// Auth pages read query params (plan, code) client-side — render them dynamically
// so Next doesn't try to statically prerender useSearchParams.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const { locale, messages } = getServerI18n();
  return (
    <I18nProvider locale={locale} messages={messages}>
      <AmbientBackground dense />
      <main className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="mb-8">
          <Logo />
        </div>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </I18nProvider>
  );
}
