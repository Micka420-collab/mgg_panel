"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Play, Square, RotateCw, Zap, LayoutDashboard, Copy, Check, Cpu, MemoryStick, HardDrive, Users, Clock,
  Terminal, FolderOpen, SlidersHorizontal, Archive, Network, ArrowLeft, Loader2, Package, CalendarClock, Users2, Palette, Activity, Map, Sparkles, Share2, Stethoscope, ArrowUpCircle, GitBranch, ShieldCheck,
} from "lucide-react";
import { useServerSocket } from "@/lib/use-server-socket";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";
import { cn, formatBytes, formatUptime } from "@/lib/util";
import { StateBadge } from "./state-badge";
import { ConsolePanel } from "./console-panel";
import { FilesPanel } from "./files-panel";
import { SettingsPanel } from "./settings-panel";
import { BackupsPanel } from "./backups-panel";
import { NetworkPanel } from "./network-panel";
import { PlaytimeCard } from "./playtime-card";
import { StatusPageCard } from "./status-page-card";
import { ModsPanel } from "./mods-panel";
import { WorkshopPanel } from "./workshop-panel";
import { SchedulesPanel } from "./schedules-panel";
import { SubusersPanel } from "./subusers-panel";
import { AppearancePanel } from "./appearance-panel";
import { PlayersPanel } from "./players-panel";
import { MetricsPanel } from "./metrics-panel";
import { ResourcesPanel } from "./resources-panel";
import { OverviewPanel } from "./overview-panel";
import { MapPanel } from "./map-panel";
import { AssistantPanel } from "./assistant-panel";
import { VelocityPanel } from "./velocity-panel";
import { ModDoctorPanel } from "./mod-doctor-panel";

type Tab = "overview" | "console" | "assistant" | "files" | "players" | "appearance" | "stats" | "resources" | "map" | "mods" | "mod-doctor" | "schedules" | "settings" | "backups" | "network" | "network-proxy" | "subusers";

export function ServerDetail({ id }: { id: string }) {
  const [detail, setDetail] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const socket = useServerSocket(id);

  // Remember the last open tab per server (survives navigation within the session).
  useEffect(() => {
    const saved = sessionStorage.getItem(`mgg:tab:${id}`);
    if (saved) setTab(saved as Tab);
  }, [id]);
  useEffect(() => {
    sessionStorage.setItem(`mgg:tab:${id}`, tab);
  }, [id, tab]);

  // Show the server name in the browser tab (handy with several tabs open).
  useEffect(() => {
    const name = detail?.server?.name;
    if (name) document.title = `${name} · MGG`;
    return () => {
      document.title = "MGG";
    };
  }, [detail?.server?.name]);

  const load = () => api(`/api/servers/${id}`).then(setDetail).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  // Re-fetch when the live state settles so address/scopes/allocations stay fresh.
  useEffect(() => {
    if (socket.state === "running" || socket.state === "offline" || socket.state === "errored") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.state]);

  if (!detail) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan" />
      </div>
    );
  }

  const s = detail.server;
  const state = socket.state ?? s.state;
  const stats = socket.stats;
  const scopes: string[] = detail.scopes ?? [];
  const can = (scope: string) => scopes.includes(scope) || scopes.includes("*");
  const running = state === "running";
  const transitioning = state === "installing" || state === "starting" || state === "stopping";

  async function power(action: string) {
    // Redémarrage avec joueurs en ligne → proposer un préavis (décompte in-game).
    let warnSeconds: number | undefined;
    if (action === "restart" && (stats?.players?.online ?? 0) > 0) {
      const ok = await confirmDialog({
        title: `${stats!.players!.online} joueur(s) en ligne`,
        description:
          "Un compte à rebours de 30 s sera diffusé en jeu, puis le serveur redémarrera. Continuer ?",
        confirmLabel: "Prévenir et redémarrer (30 s)",
      });
      if (!ok) return; // annulé → pas de redémarrage
      warnSeconds = 30;
    }
    // Arrêt/kill avec joueurs en ligne → confirmer (déconnecte tout le monde).
    if ((action === "stop" || action === "kill") && (stats?.players?.online ?? 0) > 0) {
      const ok = await confirmDialog({
        title: `${stats!.players!.online} joueur(s) en ligne`,
        description: `${action === "kill" ? "Forcer l'arrêt" : "Arrêter"} le serveur va déconnecter tout le monde immédiatement. Continuer ?`,
        danger: true,
        confirmLabel: action === "kill" ? "Forcer l'arrêt" : "Arrêter quand même",
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      await api(`/api/servers/${id}/power`, {
        method: "POST",
        json: { action, ...(warnSeconds ? { warnSeconds } : {}) },
      });
      if (warnSeconds) toast(`Compte à rebours de ${warnSeconds}s diffusé aux joueurs…`, "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
      load(); // refresh server fields after the action
    }
  }

  async function copyAddress() {
    if (!s.address) return;
    await navigator.clipboard.writeText(s.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function pushToOrigin() {
    const target = s.clonedFrom?.name ?? "the origin server";
    if (
      !(await confirmDialog({
        title: `Push to "${target}"?`,
        description: `The origin will be STOPPED and a full backup taken first (reversible from its Backups tab), then its files overwritten with this clone's. The origin keeps its ports & variables.`,
        danger: true,
        confirmLabel: "Push to origin",
      }))
    )
      return;
    setBusy("push");
    try {
      const r = await api<{ files: number; originName: string }>(`/api/servers/${id}/push`, { method: "POST" });
      toast(`Pushed ${r.files} files to "${r.originName}". A safety backup was saved on it — it was left stopped; start it when you're ready.`, "success");
      load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  const features: string[] = detail.features ?? [];
  const supportsContent = ["mods", "plugins", "modpacks", "workshop"].some((f) => features.includes(f));

  const tabs: { key: Tab; label: string; icon: any; show: boolean }[] = [
    { key: "overview", label: "Vue d'ensemble", icon: LayoutDashboard, show: true },
    { key: "console", label: "Console", icon: Terminal, show: true },
    { key: "assistant", label: "Copilot", icon: Sparkles, show: can("control.console") },
    { key: "players", label: "Players", icon: Users2, show: s.game === "minecraft" && can("control.command") },
    { key: "files", label: "Files", icon: FolderOpen, show: can("file.read") },
    { key: "appearance", label: "Appearance", icon: Palette, show: s.game === "minecraft" && can("file.read") },
    { key: "stats", label: "Stats", icon: Activity, show: can("control.console") },
    { key: "resources", label: "Ressources", icon: MemoryStick, show: can("startup.read") },
    { key: "map", label: "Map", icon: Map, show: s.game === "minecraft" && can("startup.read") },
    { key: "mods", label: "Content", icon: Package, show: supportsContent && can("startup.read") },
    { key: "mod-doctor", label: "Mod Doctor", icon: Stethoscope, show: s.game === "minecraft" && can("startup.read") },
    { key: "schedules", label: "Schedules", icon: CalendarClock, show: can("schedule.read") },
    { key: "settings", label: "Settings", icon: SlidersHorizontal, show: can("startup.read") || can("settings.rename") },
    { key: "backups", label: "Backups", icon: Archive, show: can("backup.read") },
    { key: "network", label: "Network", icon: Network, show: can("allocation.read") },
    { key: "network-proxy", label: "Proxy", icon: Share2, show: (s.templateId === "velocity-proxy" || s.game === "velocity") && can("startup.read") },
    { key: "subusers", label: "Sub-users", icon: Users2, show: detail.isOwner },
  ];

  // One-glance health: green (healthy) / amber (under load) / red (critical),
  // derived from CPU-of-limit, RAM pressure and query latency while running.
  const health = (() => {
    if (state !== "running" || !stats) return null;
    const cpu = stats.cpuPercentOfLimit ?? 0;
    const memPct = stats.memoryLimitBytes ? (stats.memoryBytes / stats.memoryLimitBytes) * 100 : 0;
    const lat = stats.latencyMs ?? 0;
    let level: "good" | "warn" | "bad" = "good";
    if (cpu > 90 || memPct > 95 || lat > 300) level = "bad";
    else if (cpu > 75 || memPct > 85 || (lat > 150 && lat > 0)) level = "warn";
    const label = level === "good" ? "Bonne santé" : level === "warn" ? "Charge élevée" : "Critique";
    return { level, label };
  })();

  const tiles: { icon: any; label: string; value: string; sub: string; pct?: number }[] = [
    { icon: Cpu, label: "CPU", value: stats ? `${stats.cpuPercentOfLimit}%` : "—", sub: stats ? `${stats.cpuPercent.toFixed(0)}% raw` : "", pct: stats ? Math.min(100, stats.cpuPercentOfLimit) : undefined },
    { icon: MemoryStick, label: "Memory", value: stats ? formatBytes(stats.memoryBytes, 0) : "—", sub: `of ${formatBytes(s.memoryMb * 1024 * 1024, 0)}`, pct: stats && stats.memoryLimitBytes ? Math.min(100, Math.round((stats.memoryBytes / stats.memoryLimitBytes) * 100)) : undefined },
    { icon: HardDrive, label: "Disk", value: stats ? formatBytes(stats.diskBytes, 0) : "—", sub: `of ${formatBytes(s.diskMb * 1024 * 1024, 0)}`, pct: stats && s.diskMb ? Math.min(100, Math.round((stats.diskBytes / (s.diskMb * 1024 * 1024)) * 100)) : undefined },
    { icon: Users, label: "Players", value: stats?.players ? `${stats.players.online}/${stats.players.max}` : "—", sub: "online" },
    { icon: Clock, label: "Uptime", value: stats ? formatUptime(stats.uptimeSeconds) : "—", sub: "" },
    { icon: Activity, label: "Latence", value: stats?.latencyMs != null ? `${stats.latencyMs} ms` : "—", sub: "requête serveur" },
    { icon: Network, label: "Réseau", value: stats ? `↓ ${formatBytes(stats.networkRxBytes, 0)}` : "—", sub: stats ? `↑ ${formatBytes(stats.networkTxBytes, 0)}` : "" },
  ];

  return (
    <div>
      <div className="mb-5 flex items-center gap-1.5 text-sm text-white/45">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Serveurs
        </Link>
        <span className="text-white/25">/</span>
        <span className="max-w-[220px] truncate text-white/70">{s.name}</span>
      </div>

      {/* header */}
      <div className="glass-raised lit-panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-black/30 text-3xl">
              {s.icon}
            </span>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="font-display text-2xl font-bold text-white">{s.name}</h1>
                <StateBadge state={state} />
                {health && (
                  <span
                    title="Santé estimée à partir du CPU, de la RAM et de la latence"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                      health.level === "good"
                        ? "border-online/30 bg-online/10 text-online"
                        : health.level === "warn"
                          ? "border-warn/30 bg-warn/10 text-warn"
                          : "border-danger/30 bg-danger/10 text-danger",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        health.level === "good" ? "bg-online" : health.level === "warn" ? "bg-warn" : "bg-danger",
                      )}
                    />
                    {health.label}
                  </span>
                )}
                {s.clonedFrom && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet/30 bg-violet/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-violet">
                    <GitBranch className="h-3 w-3" /> Clone
                  </span>
                )}
              </div>
              <button onClick={copyAddress} aria-label="Copier l'adresse du serveur" className="mt-1 inline-flex items-center gap-2 font-mono text-sm text-cyan-light hover:text-cyan">
                {s.address ?? "—"}
                {copied ? <Check className="h-3.5 w-3.5 text-online" /> : <Copy className="h-3.5 w-3.5 opacity-60" />}
              </button>
              {s.clonedFrom && (
                <div className="mt-0.5 text-xs text-white/40">
                  clone of{" "}
                  <Link href={`/dashboard/servers/${s.clonedFrom.id}`} className="text-cyan-light hover:text-cyan">
                    {s.clonedFrom.name}
                  </Link>
                </div>
              )}
              {!s.clonedFrom && s.cloneCount > 0 && (
                <div className="mt-0.5 text-xs text-white/40">{s.cloneCount} clone{s.cloneCount > 1 ? "s" : ""}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => power("start")} disabled={!can("control.start") || running || transitioning || !!busy} className="btn-ghost text-online disabled:opacity-40">
              {busy === "start" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Start
            </button>
            <button onClick={() => power("restart")} disabled={!can("control.stop") || transitioning || !!busy} className="btn-ghost disabled:opacity-40">
              {busy === "restart" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />} Restart
            </button>
            <button onClick={() => power("stop")} disabled={!can("control.stop") || !running || !!busy} className="btn-ghost text-warn disabled:opacity-40">
              {busy === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />} Stop
            </button>
            <button onClick={() => power("kill")} disabled={!can("control.stop") || state === "installing" || !!busy} className="btn-danger disabled:opacity-40" title="Force kill" aria-label="Forcer l'arrêt du serveur (kill)">
              <Zap className="h-4 w-4" />
            </button>
            {detail.isOwner && s.clonedFrom && (
              <>
                <span className="mx-1 h-6 w-px bg-white/10" />
                <button
                  onClick={pushToOrigin}
                  disabled={!!busy}
                  className="btn-ghost text-violet disabled:opacity-40"
                  title={`Push this clone's files onto ${s.clonedFrom.name}`}
                >
                  {busy === "push" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />} Push to origin
                </button>
              </>
            )}
          </div>
        </div>

        {/* stat tiles */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-xl border border-white/5 bg-black/20 p-3">
              <div className="flex items-center gap-1.5 text-xs text-white/40">
                <t.icon className="h-3.5 w-3.5" /> {t.label}
              </div>
              {stats ? (
                <div className="mt-1 font-display text-lg font-semibold text-white">{t.value}</div>
              ) : (
                <div className="mt-2 h-4 w-12 animate-pulse rounded bg-white/10" />
              )}
              {t.sub && <div className="text-[11px] text-white/30">{t.sub}</div>}
              {typeof t.pct === "number" && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      t.pct > 90 ? "bg-danger" : t.pct > 75 ? "bg-warn" : "bg-cyan",
                    )}
                    style={{ width: `${t.pct}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* live roster — real player names (Icarus via log, Minecraft via RCON).
            Admins (configured SteamIDs) are highlighted in amber. */}
        {stats?.players?.sample && stats.players.sample.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs text-white/40">Joueurs connectés :</span>
            {stats.players.sample.map((name, i) => {
              const isAdmin = (stats.players?.admins ?? []).includes(name);
              return (
                <span
                  key={`${name}-${i}`}
                  title={isAdmin ? "Admin" : undefined}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                    isAdmin
                      ? "border-warn/40 bg-warn/10 text-warn"
                      : "border-online/30 bg-online/10 text-online",
                  )}
                >
                  <span className={cn("h-1.5 w-1.5 rounded-full", isAdmin ? "bg-warn" : "bg-online")} />
                  {name}
                  {isAdmin && <ShieldCheck className="h-3 w-3" />}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* playtime leaderboard (renders only when there's data) */}
      <PlaytimeCard serverId={s.id} />

      {/* tabs */}
      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-white/10 pb-px">
        {tabs.filter((t) => t.show).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "flex items-center gap-2 rounded-t-lg px-4 py-2.5 text-sm font-medium transition",
              tab === t.key ? "border-b-2 border-cyan bg-white/[0.04] text-white" : "text-white/50 hover:text-white",
            )}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "overview" && (
          <OverviewPanel
            id={id}
            server={s}
            state={state}
            stats={stats}
            busy={busy}
            copied={copied}
            can={can}
            onPower={power}
            onCopy={copyAddress}
            onTab={(t) => setTab(t as Tab)}
          />
        )}
        {tab === "console" && (
          <ConsolePanel
            socket={socket}
            serverId={id}
            canCommand={can("control.command")}
            joinUrl={
              s.game === "icarus" || s.templateId === "icarus-dedicated"
                ? `http://${(s.address ?? "82.67.63.61").split(":")[0]}:8095`
                : undefined
            }
          />
        )}
        {tab === "assistant" && <AssistantPanel id={id} detail={detail} />}
        {tab === "players" && <PlayersPanel id={id} canManage={can("players.manage")} />}
        {tab === "files" && <FilesPanel id={id} canWrite={can("file.write")} canDelete={can("file.delete")} />}
        {tab === "appearance" && <AppearancePanel id={id} canWrite={can("file.write")} />}
        {tab === "stats" && <MetricsPanel id={id} />}
        {tab === "resources" && <ResourcesPanel id={id} canEdit={detail.isOwner} />}
        {tab === "map" && <MapPanel id={id} detail={detail} />}
        {tab === "mods" && (s.game === "garrysmod"
          ? <WorkshopPanel id={id} canManage={can("startup.update")} />
          : <ModsPanel id={id} canManage={can("startup.update")} />)}
        {tab === "mod-doctor" && <ModDoctorPanel id={id} canFix={can("file.write")} />}
        {tab === "schedules" && <SchedulesPanel id={id} canManage={can("schedule.update")} />}
        {tab === "settings" && <SettingsPanel id={id} detail={detail} onSaved={load} canRename={can("settings.rename")} canStartup={can("startup.update")} />}
        {tab === "backups" && <BackupsPanel id={id} canCreate={can("backup.create")} canDelete={can("backup.delete")} canRestore={can("backup.restore")} />}
        {tab === "network" && (
          <div className="space-y-5">
            <NetworkPanel detail={detail} isOwner={detail.isOwner} id={id} onChanged={load} />
            {detail.isOwner && <StatusPageCard serverId={id} />}
          </div>
        )}
        {tab === "network-proxy" && <VelocityPanel id={id} canManage={can("startup.update")} />}
        {tab === "subusers" && <SubusersPanel id={id} />}
      </div>
    </div>
  );
}
