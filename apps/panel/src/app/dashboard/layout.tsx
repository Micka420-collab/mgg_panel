import { redirect } from "next/navigation";
import { getCurrentUser, getAuth } from "@/lib/auth";
import { DashboardShell } from "@/components/dashboard/shell";
import { ConfirmProvider } from "@/components/ui/confirm";
import { I18nProvider } from "@/i18n/client";
import { getServerI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) {
    // distinguish "needs 2FA" from "not logged in" for a nicer redirect
    const auth = await getAuth();
    redirect(auth ? "/login" : "/login");
  }
  const { locale, messages } = getServerI18n();
  return (
    <I18nProvider locale={locale} messages={messages}>
      <DashboardShell
        user={{ username: user!.username, email: user!.email, role: user!.role, avatarUrl: user!.avatarUrl }}
      >
        <ConfirmProvider>{children}</ConfirmProvider>
      </DashboardShell>
    </I18nProvider>
  );
}
