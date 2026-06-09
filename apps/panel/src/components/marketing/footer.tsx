import Link from "next/link";
import { Logo } from "@/components/logo";

export function Footer() {
  const cols = [
    {
      title: "Product",
      links: [
        { href: "/#games", label: "Games" },
        { href: "/#features", label: "Features" },
        { href: "/#pricing", label: "Pricing" },
        { href: "/dashboard", label: "Control panel" },
      ],
    },
    {
      title: "Developers",
      links: [
        { href: "/docs", label: "Documentation" },
        { href: "/docs/launcher", label: "Launcher API" },
        { href: "/docs/api", label: "REST API" },
      ],
    },
    {
      title: "Company",
      links: [
        { href: "/#faq", label: "FAQ" },
        { href: "/status", label: "Status" },
        { href: "/legal", label: "Legal" },
      ],
    },
  ];
  return (
    <footer className="relative mt-32 border-t border-white/10 bg-base/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-14 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div>
          <Logo href={null} />
          <p className="mt-4 max-w-xs text-sm text-white/50">
            Premium multi-game hosting with a control panel that out-classes the rest. Summon a server in seconds.
          </p>
          <p className="mt-4 text-xs text-white/30">© {new Date().getFullYear()} MGG. All rights reserved.</p>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/40">{c.title}</h4>
            <ul className="space-y-2.5">
              {c.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm text-white/60 transition hover:text-cyan-light">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </footer>
  );
}
