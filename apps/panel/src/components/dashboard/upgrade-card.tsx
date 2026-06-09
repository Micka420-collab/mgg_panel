"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, Loader2, ShieldAlert, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog } from "@/components/ui/confirm";

interface UpgradeInfo {
  supported: boolean;
  current: string | null;
  currentResolved: string | null;
  latest: string | null;
  pinned: boolean;
  upgradeable: boolean;
}

/**
 * Version upgrade assistant card. Shows the server's current Minecraft version
 * vs. the latest stable release and offers a one-click upgrade that takes a
 * safety backup first, then bumps the VERSION env var (applied on next restart).
 *
 * Hidden automatically for non-Minecraft servers, or servers tracking
 * LATEST/SNAPSHOT (those auto-update on restart already).
 *
 * `canUpgrade` should reflect the user's startup.update scope.
 */
export function UpgradeCard({ id, canUpgrade }: { id: string; canUpgrade: boolean }) {
  const [info, setInfo] = useState<UpgradeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<UpgradeInfo>(`/api/servers/${id}/upgrade`);
      setInfo(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function upgrade() {
    if (!info?.latest) return;
    const target = info.latest;
    if (
      !(await confirmDialog({
        title: `Upgrade to ${target}?`,
        description: `Upgrade this server from ${info.current ?? "?"} to ${target}. A full backup is taken automatically first; the new version applies on the next restart. Mods/plugins may need updating to match.`,
        confirmLabel: "Upgrade",
      }))
    )
      return;
    setUpgrading(true);
    setError(null);
    setDone(null);
    try {
      const res = await api<{ to: string }>(`/api/servers/${id}/upgrade`, {
        method: "POST",
        json: { version: target },
      });
      setDone(`Upgraded to ${res.to}. A safety backup was taken — restart to boot the new version.`);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUpgrading(false);
    }
  }

  // Don't render for unsupported server types — keeps the settings area clean.
  if (loading) {
    return (
      <div className="glass flex items-center gap-2 p-5 text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking for version updates…
      </div>
    );
  }
  if (!info || !info.supported) return null;

  return (
    <div className="glass p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 font-display font-semibold text-white">
            <ArrowUpCircle className="h-4 w-4 text-cyan" /> Version upgrade assistant
          </h3>
          <p className="mt-1 text-sm text-white/50">
            Keep your Minecraft version current. Upgrading takes an automatic safety backup first.
          </p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            void load();
          }}
          className="rounded-lg border border-white/10 p-2 text-white/40 transition hover:text-white/80"
          title="Re-check latest version"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-white/30">Current</div>
          <div className="mt-1 font-mono text-lg text-white">
            {info.current ?? "—"}
            {info.currentResolved && info.current !== info.currentResolved && (
              <span className="ml-2 text-xs text-white/40">({info.currentResolved})</span>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3">
          <div className="text-xs uppercase tracking-wide text-white/30">Latest stable</div>
          <div className="mt-1 font-mono text-lg text-white">{info.latest ?? "unknown"}</div>
        </div>
      </div>

      {done && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-online/30 bg-online/10 px-3 py-2 text-sm text-online">
          <CheckCircle2 className="h-4 w-4 shrink-0" /> {done}
        </div>
      )}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          <ShieldAlert className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {!info.pinned ? (
        <p className="mt-4 text-sm text-white/40">
          This server tracks <span className="font-mono text-white/60">{info.current}</span> and updates
          automatically on each restart — no manual upgrade needed.
        </p>
      ) : info.upgradeable ? (
        <>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              A new version (<span className="font-mono">{info.latest}</span>) is available. Mods, plugins
              and worlds may need attention after upgrading. The change applies on the next restart.
            </span>
          </div>
          <button onClick={upgrade} disabled={upgrading || !canUpgrade} className="btn-primary mt-4">
            {upgrading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpCircle className="h-4 w-4" />}
            Upgrade to {info.latest} (auto-backup first)
          </button>
          {!canUpgrade && (
            <p className="mt-2 text-xs text-white/30">You need the startup.update permission to upgrade.</p>
          )}
        </>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-online">
          <CheckCircle2 className="h-4 w-4" /> You&apos;re on the latest stable version.
        </p>
      )}
    </div>
  );
}
