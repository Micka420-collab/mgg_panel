"use client";
import { useEffect, useState } from "react";
import {
  Play, Square, RotateCw, Copy, Check, Cpu, MemoryStick, HardDrive, Users, Clock, Activity,
  Terminal, FolderOpen, Archive, ArrowRight, AlertTriangle, Info, ShieldAlert, Loader2,
} from "lucide-react";
import { api } from "@/lib/client";

function fmtBytes(b: number, d = 1): string {
  if (!b) return "0 o";
  const u = ["o", "Ko", "Mo", "Go", "To"];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / 1024 ** i).toFixed(d)} ${u[i]}`;
}
function fmtUptime(s: number): string {
  if (!s) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d) return `${d}j ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}
function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant"; if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`; return `${Math.floor(s / 86400)} j`;
}

const STATE: Record<string, { label: string; cls: string; dot: string }> = {
  running: { label: "En ligne", cls: "text-online", dot: "bg-online" },
  offline: { label: "Hors ligne", cls: "text-white/50", dot: "bg-white/30" },
  starting: { label: "Démarrage…", cls: "text-warn", dot: "bg-warn animate-pulse" },
  installing: { label: "Installation…", cls: "text-warn", dot: "bg-warn animate-pulse" },
  stopping: { label: "Arrêt…", cls: "text-warn", dot: "bg-warn animate-pulse" },
  errored: { label: "Erreur", cls: "text-danger", dot: "bg-danger" },
  suspended: { label: "Suspendu", cls: "text-danger", dot: "bg-danger" },
};
const NLEVEL: Record<string, any> = { critical: ShieldAlert, warning: AlertTriangle, info: Info };

interface Props {
  id: string;
  server: any;
  state: string;
  stats: any;
  busy: string | null;
  copied: boolean;
  can: (scope: string) => boolean;
  onPower: (action: string) => void;
  onCopy: () => void;
  onTab: (tab: string) => void;
}

export function OverviewPanel({ id, server, state, stats, busy, copied, can, onPower, onCopy, onTab }: Props) {
  const [events, setEvents] = useState<any[] | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ notifications: any[] }>(`/api/notifications?serverId=${id}`)
      .then((r) => alive && setEvents(r.notifications.slice(0, 5)))
      .catch(() => alive && setEvents([]));
    return () => { alive = false; };
  }, [id, state]);

  const st = STATE[state] ?? STATE.offline;
  const running = state === "running";
  const busyAny = !!busy;
  const memPct = stats?.memoryLimitBytes ? Math.min(100, Math.round((stats.memoryBytes / stats.memoryLimitBytes) * 100)) : 0;
  const cpuPct = stats ? Math.min(100, stats.cpuPercentOfLimit ?? 0) : 0;
  const diskPct = server.diskMb ? Math.min(100, Math.round((stats?.diskBytes ?? 0) / (server.diskMb * 1048576) * 100)) : 0;
  const canPower = can("control.start") || can("control.stop") || can("control.restart") || can("*");

  const gauge = (icon: any, label: string, value: string, pct: number, sub?: string) => {
    const Icon = icon;
    const bar = pct > 90 ? "bg-danger" : pct > 70 ? "bg-warn" : "bg-cyan";
    return (
      <div className="glass p-4">
        <div className="flex items-center justify-between text-xs text-white/45"><span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" /> {label}</span><span>{pct}%</span></div>
        <div className="mt-1.5 text-xl font-semibold text-white">{value}</div>
        {sub && <div className="text-xs text-white/35">{sub}</div>}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${bar} transition-all`} style={{ width: `${pct}%` }} /></div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* status + power */}
      <div className="glass flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-black/30 text-2xl">{server.icon ?? "🎮"}</span>
          <div>
            <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${st.dot}`} /><span className={`font-semibold ${st.cls}`}>{st.label}</span></div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-white/40">
              <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {running ? fmtUptime(stats?.uptimeSeconds ?? 0) : "arrêté"}</span>
              {stats?.latencyMs != null && <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3" /> {stats.latencyMs} ms</span>}
            </div>
          </div>
        </div>
        {canPower && (
          <div className="flex gap-2">
            <button onClick={() => onPower("start")} disabled={busyAny || running} className="btn-ghost text-sm disabled:opacity-40">
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 text-online" />} Démarrer
            </button>
            <button onClick={() => onPower("restart")} disabled={busyAny || !running} className="btn-ghost text-sm disabled:opacity-40">
              {busy === "restart" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4 text-cyan" />} Redémarrer
            </button>
            <button onClick={() => onPower("stop")} disabled={busyAny || !running} className="btn-ghost text-sm disabled:opacity-40">
              {busy === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4 text-danger" />} Arrêter
            </button>
          </div>
        )}
      </div>

      {/* address + players */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass p-5">
          <div className="text-xs uppercase tracking-wide text-white/35">Adresse de connexion</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-cyan-light">{server.address ?? "—"}</code>
            {server.address && (
              <button onClick={onCopy} className="rounded-lg border border-white/10 p-2 text-white/50 transition hover:text-white" title="Copier">
                {copied ? <Check className="h-4 w-4 text-online" /> : <Copy className="h-4 w-4" />}
              </button>
            )}
          </div>
          <div className="mt-2 text-xs text-white/40">{server.templateName ?? server.game}</div>
        </div>
        <div className="glass p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-wide text-white/35"><span>Joueurs</span><Users className="h-3.5 w-3.5" /></div>
          <div className="mt-2 text-2xl font-semibold text-white">{stats?.players ? `${stats.players.online} / ${stats.players.max}` : "—"}</div>
          {stats?.players?.sample?.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {stats.players.sample.slice(0, 12).map((p: string) => (
                <span key={p} className={`rounded-md px-2 py-0.5 text-xs ${stats.players.admins?.includes(p) ? "bg-warn/15 text-warn" : "bg-white/[0.06] text-white/70"}`}>{p}</span>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-xs text-white/35">{running ? "Personne connecté" : "Serveur arrêté"}</div>
          )}
        </div>
      </div>

      {/* resource gauges */}
      <div className="grid gap-4 sm:grid-cols-3">
        {gauge(Cpu, "CPU", stats ? `${stats.cpuPercentOfLimit ?? 0}%` : "—", cpuPct, stats ? `${(stats.cpuPercent ?? 0).toFixed(0)}% brut` : "")}
        {gauge(MemoryStick, "Mémoire", stats ? fmtBytes(stats.memoryBytes) : "—", memPct, `sur ${fmtBytes((server.memoryMb ?? 0) * 1048576, 0)}`)}
        {gauge(HardDrive, "Disque", stats ? fmtBytes(stats.diskBytes) : "—", diskPct, `sur ${fmtBytes((server.diskMb ?? 0) * 1048576, 0)}`)}
      </div>

      {/* quick links + recent events */}
      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="glass p-5">
          <div className="text-xs uppercase tracking-wide text-white/35">Accès rapide</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              { t: "console", label: "Console", icon: Terminal, show: true },
              { t: "files", label: "Fichiers", icon: FolderOpen, show: can("file.read") },
              { t: "backups", label: "Sauvegardes", icon: Archive, show: can("backup.read") },
              { t: "resources", label: "Ressources", icon: Cpu, show: can("startup.read") },
            ].filter((x) => x.show).map((x) => (
              <button key={x.t} onClick={() => onTab(x.t)} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white/70 transition hover:border-white/25 hover:text-white">
                <x.icon className="h-4 w-4 text-cyan" /> {x.label} <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-40" />
              </button>
            ))}
          </div>
        </div>
        <div className="glass p-5">
          <div className="text-xs uppercase tracking-wide text-white/35">Événements récents</div>
          <div className="mt-3 space-y-2">
            {events === null ? (
              <div className="flex items-center gap-2 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> …</div>
            ) : events.length === 0 ? (
              <div className="text-sm text-white/35">Aucun événement récent. Tout va bien. ✅</div>
            ) : (
              events.map((e) => {
                const Icon = NLEVEL[e.level] ?? Info;
                const cls = e.level === "critical" ? "text-danger" : e.level === "warning" ? "text-warn" : "text-cyan";
                return (
                  <div key={e.id} className="flex items-start gap-2 text-sm">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cls}`} />
                    <span className="flex-1 text-white/75">{e.message}</span>
                    <span className="shrink-0 text-xs text-white/30">{ago(e.createdAt)}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
