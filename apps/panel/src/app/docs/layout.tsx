import Link from "next/link";
import { AmbientBackground } from "@/components/ambient";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";

const sections = [
  { href: "/docs", label: "Overview" },
  { href: "/docs/hosting", label: "Hébergement" },
  { href: "/docs/launcher", label: "Launcher API" },
  { href: "/docs/api", label: "REST API" },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AmbientBackground />
      <MarketingNav />
      <main className="mx-auto grid max-w-6xl gap-10 px-6 pt-32 pb-10 lg:grid-cols-[200px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-32 space-y-1">
            {sections.map((s) => (
              <Link key={s.href} href={s.href} className="block rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white">
                {s.label}
              </Link>
            ))}
          </div>
        </aside>
        <article className="max-w-3xl">{children}</article>
      </main>
      <Footer />
    </>
  );
}
