"use client";
import { useCallback, useEffect, useState } from "react";
import { Map as MapIcon, Loader2, ExternalLink, RefreshCw, Info, Sparkles, ShieldAlert } from "lucide-react";
import { api } from "@/lib/client";

interface MapState {
  enabled: boolean;
  supported: boolean;
  port: number | null;
  url: string | null;
}

export function MapPanel({ id, detail }: { id: string; detail?: any }) {
  const scopes: string[] = detail?.scopes ?? [];
  const canManage = scopes.includes("startup.update") || scopes.includes("*");

  const [state, setState] = useState<MapState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<MapState>(`/api/servers/${id}/map`);
      setState(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<MapState>(`/api/servers/${id}/map`, { method: "POST" });
      setState(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !state) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan" />
      </div>
    );
  }

  // Non-minecraft servers shouldn't normally reach this tab, but guard anyway.
  if (state && !state.supported) {
    return (
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white">
          <MapIcon className="h-4 w-4 text-cyan" /> Live map
        </h3>
        <p className="mt-1 text-sm text-white/45">The live map is only available for Minecraft servers.</p>
      </div>
    );
  }

  if (state?.enabled && state.url) {
    return (
      <div className="space-y-5">
        <div className="glass flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <h3 className="flex items-center gap-2 font-display font-semibold text-white">
              <MapIcon className="h-4 w-4 text-cyan" /> Live map
            </h3>
            <p className="mt-1 text-sm text-white/45">
              A real-time 3D map of your world, rendered by BlueMap and served at{" "}
              <span className="font-mono text-cyan-light">{state.url}</span>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setReloadKey((k) => k + 1)} className="btn-ghost" title="Reload map">
              <RefreshCw className="h-4 w-4" /> Reload
            </button>
            <a href={state.url} target="_blank" rel="noreferrer" className="btn-ghost">
              <ExternalLink className="h-4 w-4" /> Open
            </a>
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium">This map is public and unencrypted.</p>
            <p className="text-warn/80">
              Anyone with the link can see your world — and, by default, the <strong>live positions of online players</strong>.
              It&apos;s served over plain <span className="font-mono">http://</span> (so it won&apos;t embed below on an HTTPS panel —
              use <strong>Open</strong>). For a private or PvP world, connect a custom domain in the <strong>Network</strong> tab to
              serve it over HTTPS, and hide players in BlueMap&apos;s config.
            </p>
          </div>
        </div>

        <div className="glass overflow-hidden p-0">
          <iframe
            key={reloadKey}
            src={state.url}
            title="Live map"
            className="h-[70vh] w-full border-0 bg-black/40"
            allowFullScreen
          />
        </div>

        <p className="flex items-center gap-1.5 text-xs text-white/35">
          <Info className="h-3.5 w-3.5" /> The map renders progressively while the server runs. If it&apos;s blank, give
          BlueMap a few minutes after the first start to scan the world.
        </p>
      </div>
    );
  }

  // Not enabled yet — offer to turn it on.
  return (
    <div className="space-y-5">
      <div className="glass p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-cyan/10 text-cyan">
          <MapIcon className="h-6 w-6" />
        </div>
        <h3 className="mt-4 font-display text-lg font-semibold text-white">Enable the live map</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-white/45">
          Install <span className="text-white/70">BlueMap</span> to render an explorable, real-time 3D web map of your
          world. We&apos;ll add the mod and publish its web port automatically.
        </p>

        <div className="mx-auto mt-4 flex max-w-md items-start gap-2.5 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2.5 text-left text-sm text-warn">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Heads up: the map is served <strong>publicly over plain HTTP</strong> and, by default, shows the{" "}
            <strong>live positions of online players</strong>. Only enable it for a world you&apos;re happy to make public.
          </span>
        </div>

        {error && (
          <div className="mx-auto mt-4 max-w-md rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canManage ? (
          <button onClick={enable} disabled={busy} className="btn-primary mx-auto mt-5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Enable live map
          </button>
        ) : (
          <p className="mt-5 text-sm text-white/40">Ask the server owner to enable the live map.</p>
        )}

        <p className="mx-auto mt-4 flex max-w-md items-center justify-center gap-1.5 text-xs text-white/35">
          <Info className="h-3.5 w-3.5" /> Enabling rebuilds the server, so it&apos;ll need a (re)start afterwards.
        </p>
      </div>
    </div>
  );
}
