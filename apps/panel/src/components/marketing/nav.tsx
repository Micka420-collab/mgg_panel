"use client";
import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/logo";

const links = [
  { href: "/#games", label: "Games" },
  { href: "/#hosting", label: "Hosting" },
  { href: "/#features", label: "Features" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#launcher", label: "Launcher API" },
  { href: "/docs", label: "Docs" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto mt-4 flex max-w-6xl items-center justify-between rounded-2xl border border-white/10 bg-base/60 px-5 py-3 backdrop-blur-xl">
        <Logo />
        <nav className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-sm text-white/70 transition hover:text-white">
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <Link href="/login" className="text-sm font-medium text-white/80 hover:text-white">
            Sign in
          </Link>
          <Link href="/register" className="btn-primary">
            Deploy a server
          </Link>
        </div>
        <button className="md:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X className="text-white" /> : <Menu className="text-white" />}
        </button>
      </div>
      {open && (
        <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-white/10 bg-base/90 p-4 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-3">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-white/80">
                {l.label}
              </Link>
            ))}
            <div className="mt-2 flex gap-3">
              <Link href="/login" className="btn-ghost flex-1">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary flex-1">
                Get started
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
