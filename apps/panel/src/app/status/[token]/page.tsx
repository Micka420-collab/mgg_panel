import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getTemplate, buildAddress } from "@mgg/shared";
import { DaemonClient } from "@/lib/daemon";
import { AmbientBackground } from "@/components/ambient";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { cn } from "@/lib/util";

export const dynamic = "force-dynamic";

/**
 * Public, login-free, shareable server status page (/status/<token>).
 * Exposes ONLY safe info: name, game, live state, player count + names, and the
 * join address. Never env vars, passwords, node internals or owner data.
 */
export default async function PublicStatus({ params }: { params: { token: string } }) {
  const server = await db.server.findUnique({
    where: { statusToken: params.token },
    include: { allocations: true, node: true },
  });
  if (!server) notFound();

  const tpl = getTemplate(server.templateId);
  const primary = server.allocations.find((a) => a.primary) ?? server.allocations[0];
  const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;
  const address = primary ? buildAddress(primary.ip, primary.port, defaultPort) : null;

  let state = server.state as string;
  let players: { online: number; max: number; sample?: string[] } | null = null;
  try {
    const status = await new DaemonClient(server.node).status(server.id);
    if (status?.state) state = status.state;
    if (status?.players) players = status.players as { online: number; max: number; sample?: string[] };
  } catch {
    /* node unreachable → fall back to cached state, no players */
  }

  const online = state === "running";
  const names = players?.sample ?? [];

  return (
    <main className="relative min-h-screen">
      <AmbientBackground />
      <AutoRefresh seconds={20} />
      <div className="mx-auto flex max-w-lg flex-col items-center px-5 py-16">
        <div className="glass-raised control-glow w-full p-8 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-white/10 bg-black/30 text-4xl">
            {tpl?.icon ?? "🎮"}
          </span>
          <h1 className="mt-4 font-display text-2xl font-bold text-white">{server.name}</h1>
          <p className="mt-1 text-sm text-white/45">{tpl?.name ?? server.templateId}</p>

          <div
            className={cn(
              "mt-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold",
              online ? "border-online/30 bg-online/10 text-online" : "border-white/15 bg-white/5 text-white/55",
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", online ? "animate-pulse bg-online" : "bg-white/30")} />
            {online ? "En ligne" : "Hors ligne"}
          </div>

          {address && (
            <div className="mt-6 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.08em] text-white/35">Adresse de connexion</div>
              <div className="mt-0.5 font-mono text-cyan-light">{address}</div>
            </div>
          )}

          {online && players && (
            <div className="mt-6">
              <div className="font-display text-4xl font-bold text-white">
                {players.online}
                <span className="text-xl text-white/35">/{players.max}</span>
              </div>
              <div className="mt-0.5 text-xs uppercase tracking-wide text-white/40">joueurs en ligne</div>
              {names.length > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {names.map((n, i) => (
                    <span
                      key={`${n}-${i}`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-online/30 bg-online/10 px-2.5 py-1 text-xs font-medium text-online"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-online" /> {n}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <p className="mt-6 text-xs text-white/25">Propulsé par MGG · actualisé automatiquement</p>
      </div>
    </main>
  );
}
