import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { PublicServerCard } from "@/components/public/server-card";
import { getPublicServer } from "@/lib/public-server";

/**
 * Public, shareable mini-site for one server, reached at `/s/<subdomain>`.
 * No login. Turns a bare IP into a destination: live players, status, a
 * one-click "Copy address", and a "Hosted on MGG" footer so every share is an
 * ad. Read-only — connecting wakes a sleeping server via the edge proxy, so
 * there is no abusable public "start" button here.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { subdomain: string } }): Promise<Metadata> {
  const server = await getPublicServer(params.subdomain);
  if (!server) return { title: "Server not found — MGG" };
  const title = `${server.name} — play now`;
  const description = server.motd ?? `${server.game} server · ${server.players.online} online · ${server.address}`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary", title, description },
  };
}

export default async function PublicServerPage({ params }: { params: { subdomain: string } }) {
  const server = await getPublicServer(params.subdomain);
  if (!server) notFound();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-base px-4 py-12">
      {/* ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid-faint [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-cyan/10 blur-3xl" />

      <div className="relative flex w-full max-w-lg flex-col items-center gap-8">
        <Logo />
        <PublicServerCard initial={server} subdomain={params.subdomain} />
        <Link href="/" className="text-xs text-white/30 transition hover:text-white/60">
          Hosted on <span className="font-semibold text-white/50">MGG</span> — spin up your own game server in seconds →
        </Link>
      </div>
    </main>
  );
}
