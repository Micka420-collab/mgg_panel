"use client";
import { useCallback, useEffect, useState } from "react";
import {
  MemoryStick, Cpu, Loader2, Save, AlertTriangle, RotateCw, Server as ServerIcon, Info,
} from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";

interface ResourcesData {
  server: { id: string; name: string; memoryMb: number; cpuPercent: number; diskMb: number; state: string };
  usage: { memoryBytes: number; memoryLimitBytes: number; cpuPercentOfLimit: number } | null;
  host: { totalMb: number; availableMb: number; runningMb: number; cpus: number } | null;
  allocation: { committedMb: number; servers: { id: string; name: string; memoryMb: number; running: boolean; self: boolean }[] };
  bounds: { minMb: number; maxMb: number; stepMb: number; reserveMb: number; maxCpuPercent: number };
  canEdit: boolean;
}

const gb = (mb: number) => (mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1);
const gbBytes = (b: number) => (b / 1073741824).toFixed(1);

/** Complete RAM (+ CPU) manager: host capacity, this server's allocation, live usage. */
export function ResourcesPanel({ id, canEdit }: { id: string; canEdit: boolean }) {
  const [data, setData] = useState<ResourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mem, setMem] = useState(0);
  const [cpu, setCpu] = useState(0);

  const load = useCallback(async () => {
    try {
      const d = await api<ResourcesData>(`/api/servers/${id}/resources`);
      setData(d);
      setMem(d.server.memoryMb);
      setCpu(d.server.cpuPercent);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="glass flex items-center gap-2 p-6 text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement des ressources…
      </div>
    );
  }
  if (!data) {
    return (
      <div className="glass flex items-center gap-2 p-6 text-sm text-danger">
        <AlertTriangle className="h-4 w-4" /> {error ?? "Impossible de charger les ressources."}
      </div>
    );
  }

  const { server, usage, host, allocation, bounds } = data;
  const dirty = mem !== server.memoryMb || cpu !== server.cpuPercent;

  // Committed RAM across the node if this change were applied.
  const committedAfter = allocation.committedMb - server.memoryMb + mem;
  const freeToAllocate = host ? host.totalMb - bounds.reserveMb - committedAfter : null;
  const overcommitted = freeToAllocate !== null && freeToAllocate < 0;

  // How much of THIS server's allocation is actually in use right now.
  const usedPct =
    usage && usage.memoryLimitBytes
      ? Math.min(100, Math.round((usage.memoryBytes / usage.memoryLimitBytes) * 100))
      : null;

  // Host RAM bar: committed (allocated) over total, plus physical-free marker.
  const committedPct = host ? Math.min(100, Math.round((committedAfter / host.totalMb) * 100)) : 0;
  const committedBar = committedPct > 95 ? "bg-danger" : committedPct > 80 ? "bg-warn" : "bg-cyan";

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ restartNeeded?: boolean; running?: boolean; nodeOk?: boolean }>(
        `/api/servers/${id}/resources`,
        { method: "PATCH", json: { memoryMb: mem, cpuPercent: cpu } },
      );
      toast("Ressources enregistrées.", "success");
      if (res?.nodeOk === false) {
        toast("Node injoignable — appliqué en base, prendra effet quand le node revient.", "error");
      }
      await load();
      // Limits only take effect when the container is rebuilt → offer a restart now.
      if (res?.restartNeeded && res?.running) {
        if (
          await confirmDialog({
            title: "Appliquer maintenant ?",
            description:
              "La nouvelle allocation RAM/CPU nécessite un redémarrage du serveur pour prendre effet. Redémarrer maintenant ? (sinon elle s'appliquera au prochain démarrage)",
            confirmLabel: "Redémarrer et appliquer",
          })
        ) {
          try {
            await api(`/api/servers/${id}/power`, { method: "POST", json: { action: "restart" } });
            toast("Serveur en redémarrage — la nouvelle RAM s'applique.", "success");
          } catch (e: any) {
            toast(e.message, "error");
          }
        }
      }
    } catch (e: any) {
      setError(e.message);
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Host capacity ───────────────────────────────────────────── */}
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white">
          <ServerIcon className="h-4 w-4 text-cyan" /> Capacité de l'hôte
        </h3>
        {host ? (
          <>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-white/50">
                <span>
                  <span className="text-white/80">{gb(committedAfter)} Go</span> alloués / {gb(host.totalMb)} Go
                </span>
                <span className={overcommitted ? "text-danger" : freeToAllocate! < 1024 ? "text-warn" : "text-online"}>
                  {overcommitted ? `sur-alloué de ${gb(-freeToAllocate!)} Go` : `${gb(freeToAllocate!)} Go libres à allouer`}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full ${committedBar} transition-all`} style={{ width: `${committedPct}%` }} />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2">
                <div className="text-xs text-white/40">RAM physique libre</div>
                <div className="mt-0.5 font-mono text-sm text-white">{gb(host.availableMb)} Go</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2">
                <div className="text-xs text-white/40">En ligne (réel)</div>
                <div className="mt-0.5 font-mono text-sm text-white">{gb(host.runningMb)} Go</div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-2 py-2">
                <div className="text-xs text-white/40">Cœurs CPU</div>
                <div className="mt-0.5 font-mono text-sm text-white">{host.cpus || "—"}</div>
              </div>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-white/40">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              « Alloués » = somme des RAM réservées à tous les serveurs (même éteints). Un serveur éteint ne consomme
              pas de RAM physique : tu peux sur-allouer, mais un serveur ne démarrera que si l'hôte a assez de RAM libre
              à ce moment-là ({bounds.reserveMb} Mo gardés pour l'hôte).
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-white/40">Capacité de l'hôte indisponible (node injoignable).</p>
        )}
      </div>

      {/* ── This server's RAM ───────────────────────────────────────── */}
      <div className="glass p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display font-semibold text-white">
            <MemoryStick className="h-4 w-4 text-cyan" /> Mémoire RAM de ce serveur
          </h3>
          <div className="font-mono text-lg text-white">
            {gb(mem)} <span className="text-sm text-white/40">Go</span>
            <span className="ml-2 text-xs text-white/30">({mem} Mo)</span>
          </div>
        </div>

        {/* live usage of the current allocation */}
        {usage && usedPct !== null && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-xs text-white/40">
              <span>Utilisé actuellement</span>
              <span className={usedPct > 90 ? "text-warn" : ""}>
                {gbBytes(usage.memoryBytes)} Go / {gb(server.memoryMb)} Go · {usedPct}%
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full ${usedPct > 90 ? "bg-warn" : "bg-online"} transition-all`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        )}

        <input
          type="range"
          min={bounds.minMb}
          max={bounds.maxMb}
          step={bounds.stepMb}
          value={Math.min(mem, bounds.maxMb)}
          disabled={!canEdit}
          onChange={(e) => setMem(Number(e.target.value))}
          className="mt-5 w-full accent-cyan disabled:opacity-50"
        />
        <div className="mt-1 flex justify-between text-xs text-white/30">
          <span>{gb(bounds.minMb)} Go</span>
          <span>max {gb(bounds.maxMb)} Go</span>
        </div>

        {/* quick presets */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[1024, 2048, 4096, 6144, 8192, 12288, 16384].filter((p) => p >= bounds.minMb && p <= bounds.maxMb).map((p) => (
            <button
              key={p}
              disabled={!canEdit}
              onClick={() => setMem(p)}
              className={`rounded-lg border px-2.5 py-1 text-xs transition disabled:opacity-40 ${
                mem === p ? "border-cyan/60 bg-cyan/10 text-cyan" : "border-white/10 text-white/60 hover:text-white"
              }`}
            >
              {gb(p)} Go
            </button>
          ))}
        </div>

        {overcommitted && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              Avec cette valeur, la RAM totale allouée dépasse la capacité de l'hôte. Ce serveur fonctionnera, mais tous
              les serveurs ne pourront pas tourner en même temps.
            </span>
          </div>
        )}
      </div>

      {/* ── This server's CPU ───────────────────────────────────────── */}
      <div className="glass p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display font-semibold text-white">
            <Cpu className="h-4 w-4 text-cyan" /> Limite CPU
          </h3>
          <div className="font-mono text-lg text-white">
            {cpu}% <span className="text-sm text-white/40">(≈ {(cpu / 100).toFixed(cpu % 100 === 0 ? 0 : 1)} cœur{cpu >= 200 ? "s" : ""})</span>
          </div>
        </div>
        <input
          type="range"
          min={25}
          max={bounds.maxCpuPercent}
          step={25}
          value={Math.min(cpu, bounds.maxCpuPercent)}
          disabled={!canEdit}
          onChange={(e) => setCpu(Number(e.target.value))}
          className="mt-4 w-full accent-cyan disabled:opacity-50"
        />
        <div className="mt-1 flex justify-between text-xs text-white/30">
          <span>25%</span>
          <span>max {bounds.maxCpuPercent}%</span>
        </div>
        {usage && (
          <p className="mt-2 text-xs text-white/40">Utilisation CPU actuelle : {usage.cpuPercentOfLimit}% de la limite.</p>
        )}
      </div>

      {/* ── Save bar ────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!dirty || saving} className="btn-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer{dirty ? ` (${gb(mem)} Go · ${cpu}%)` : ""}
          </button>
          {dirty && (
            <button
              onClick={() => {
                setMem(server.memoryMb);
                setCpu(server.cpuPercent);
              }}
              className="text-sm text-white/40 transition hover:text-white/70"
            >
              Annuler
            </button>
          )}
          <span className="flex items-center gap-1.5 text-xs text-white/30">
            <RotateCw className="h-3 w-3" /> appliqué au (re)démarrage
          </span>
        </div>
      ) : (
        <p className="text-xs text-white/30">Seul le propriétaire peut changer les ressources.</p>
      )}

      {/* ── Allocation breakdown ────────────────────────────────────── */}
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white">
          <MemoryStick className="h-4 w-4 text-cyan" /> Répartition de la RAM sur l'hôte
        </h3>
        <div className="mt-4 space-y-2.5">
          {allocation.servers.map((s) => {
            const pct = host ? Math.min(100, Math.round((s.memoryMb / host.totalMb) * 100)) : 0;
            return (
              <div key={s.id} className={`rounded-lg px-3 py-2 ${s.self ? "border border-cyan/30 bg-cyan/[0.05]" : "border border-white/5 bg-white/[0.02]"}`}>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-white/80">
                    <span className={`h-2 w-2 rounded-full ${s.running ? "bg-online" : "bg-white/20"}`} />
                    {s.name}
                    {s.self && <span className="text-xs text-cyan">(ce serveur)</span>}
                  </span>
                  <span className="font-mono text-white/60">{gb(s.memoryMb)} Go</span>
                </div>
                {host && (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${s.self ? "bg-cyan" : s.running ? "bg-online/60" : "bg-white/20"}`} style={{ width: `${pct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
