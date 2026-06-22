"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Server, Settings, ShieldAlert, LogOut, Menu, X, BookOpen, Plus, CreditCard, Blocks, HardDrive, Search } from "lucide-react";
import { Logo } from "@/components/logo";
import { AmbientBackground } from "@/components/ambient";
import { CommandPalette } from "./command-palette";
import { AlertsBadge } from "./alerts-badge";
import { cn } from "@/lib/util";
import { api } from "@/lib/client";
import { useT } from "@/i18n/client";
import { LanguageSwitcher } from "./language-switcher";

interface ShellUser {
  username: string;
  email: string;
  role: string;
  avatarUrl: string | null;
}

export function DashboardShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { t } = useT();

  const nav = [
    { href: "/dashboard", label: t("nav.servers"), icon: Server, exact: true },
    { href: "/dashboard/blueprints", label: t("nav.blueprints"), icon: Blocks },
    { href: "/dashboard/billing", label: t("nav.billing"), icon: CreditCard },
    { href: "/dashboard/account", label: t("nav.account"), icon: Settings },
    { href: "/dashboard/storage", label: t("nav.storage"), icon: HardDrive },
    ...(user.role === "ADMIN" ? [{ href: "/dashboard/admin", label: t("nav.admin"), icon: ShieldAlert }] : []),
    { href: "/docs", label: t("nav.docs"), icon: BookOpen },
  ];

  async function logout() {
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.push("/login");
  }

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <>
      <AmbientBackground />
      <CommandPalette />
      <div className="flex min-h-screen">
        {/* sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-base/70 p-4 backdrop-blur-xl transition-transform lg:translate-x-0",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="px-2 py-2">
            <Logo />
          </div>
          <button
            onClick={() => window.dispatchEvent(new Event("mgg:open-cmdk"))}
            className="mt-4 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/45 transition hover:border-white/20 hover:text-white"
          >
            <Search className="h-4 w-4" /> Rechercher
            <kbd className="ml-auto rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">⌘K</kbd>
          </button>
          <Link href="/dashboard/new" className="btn-primary mt-3" onClick={() => setOpen(false)}>
            <Plus className="h-4 w-4" /> {t("nav.newServer")}
          </Link>
          <nav className="mt-6 flex flex-1 flex-col gap-1">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                  isActive(n.href, n.exact)
                    ? "bg-white/10 text-white"
                    : "text-white/55 hover:bg-white/5 hover:text-white",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
                {n.href === "/dashboard/admin" && <AlertsBadge />}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-3">
            <LanguageSwitcher />
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-violet text-sm font-semibold text-white">
                {user.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{user.username}</div>
                <div className="truncate text-xs text-white/40">{user.email}</div>
              </div>
            </div>
            <button onClick={logout} className="btn-ghost mt-3 w-full justify-start text-sm">
              <LogOut className="h-4 w-4" /> {t("nav.signOut")}
            </button>
            </div>
          </div>
        </aside>

        {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

        {/* main */}
        <div className="flex-1 lg:pl-64">
          <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-base/60 px-5 py-3 backdrop-blur-xl lg:hidden">
            <Logo />
            <button onClick={() => setOpen((v) => !v)} aria-label="Menu">
              {open ? <X className="text-white" /> : <Menu className="text-white" />}
            </button>
          </header>
          <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
        </div>
      </div>
    </>
  );
}
