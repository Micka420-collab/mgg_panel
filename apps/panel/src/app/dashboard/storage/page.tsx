"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { HardDrive, Loader2, AlertTriangle, Trash2, Server as ServerIcon, CircleAlert } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";
import { formatBytes } from "@/lib/util";

interface NodeFs {
  id: string;
  name: string;
  fqdn: string;
  online: boolean;
  fs: { totalBytes: number; freeBytes: number; usedBytes: number } | null;
}
interface ServerRow {
  id: string;
  name: string;
  game: string;
  icon: string;
  nodeId: string;
  bytes: number;
}
interface StorageData {
  isAdmin: boolean;
  nodes: NodeFs[];
  servers: ServerRow[];
}

function pct(used: number, total: number) {
  return total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
}
function barColor(p: number) {
  return p >= 90 ? "bg-danger" : p >= 75 ? "bg-warn" : "bg-cyan";
}

export default function StoragePage() {
  const [data, setData] = useState<StorageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<StorageData>("/api/storage").then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  if (error) {
    return <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>;
  }
  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-cyan" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-white">
        <HardDrive className="h-6 w-6 text-cyan" /> Storage
      </h1>
      <p className="mt-1 text-sm text-white/50">Disk usage of your VM and a breakdown by server.</p>

      {/* node filesystem usage */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {data.nodes.map((n) => {
          const p = n.fs ? pct(n.fs.usedBytes, n.fs.totalBytes) : 0;
          return (
            <div key={n.id} className="glass-raised p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-medium text-white">
                  <ServerIcon className="h-4 w-4 text-white/50" /> {n.name}
                </div>
                <span className={n.online ? "text-xs text-online" : "text-xs text-white/40"}>
                  {n.online ? "online" : "offline"}
                </span>
              </div>
              {n.fs ? (
                <>
                  <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${barColor(p)}`} style={{ width: `${p}%` }} />
                  </div>
                  <div className="mt-2 flex justify-between text-xs text-white/55">
                    <span>
                      <span className="font-semibold text-white">{formatBytes(n.fs.usedBytes)}</span> used · {p}%
                    </span>
                    <span>{formatBytes(n.fs.freeBytes)} free of {formatBytes(n.fs.totalBytes)}</span>
                  </div>
                </>
              ) : (
                <p className="mt-4 text-sm text-white/40">Node unreachable — can't read disk usage.</p>
              )}
            </div>
          );
        })}
        {data.nodes.length === 0 && <p className="text-sm text-white/40">No nodes to show.</p>}
      </div>

      {/* per-server breakdown */}
      <h2 className="mt-8 text-xs font-semibold uppercase tracking-widest text-white/40">By server</h2>
      <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
        {data.servers.length === 0 ? (
          <div className="px-4 py-6 text-sm text-white/40">No servers yet.</div>
        ) : (
          data.servers.map((s, i) => (
            <Link
              key={s.id}
              href={`/dashboard/servers/${s.id}`}
              className={`flex items-center gap-3 px-4 py-3 transition hover:bg-white/5 ${i > 0 ? "border-t border-white/5" : ""}`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/30 text-base">
                {s.icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-white">{s.name}</div>
                <div className="truncate text-xs text-white/40">{s.game}</div>
              </div>
              <div className="font-mono text-sm text-white/70">{formatBytes(s.bytes)}</div>
            </Link>
          ))
        )}
      </div>

      {data.isAdmin && <DangerZone />}
    </div>
  );
}

/** Admin-only: wipe the entire installation off the VM. Typed phrase + confirm popup. */
function DangerZone() {
  const PHRASE = "DELETE EVERYTHING";
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);

  async function destroyAll() {
    if (phrase !== PHRASE) return;
    const ok = await confirmDialog({
      title: "Delete the ENTIRE installation?",
      description:
        "This wipes the whole MGG platform from this VM — every server, all worlds, files, backups, the database and the panel itself. It cannot be undone, and the panel will go offline within seconds.",
      danger: true,
      confirmLabel: "Delete everything",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api("/api/admin/destroy", { method: "POST", json: { confirm: PHRASE } });
      toast("Self-destruct armed — the installation is being wiped. The panel will go offline now.", "error");
    } catch (e: any) {
      toast(e.message, "error");
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-2xl border border-danger/30 bg-danger/[0.06] p-6">
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-danger">
        <AlertTriangle className="h-5 w-5" /> Danger zone
      </h2>
      <p className="mt-2 max-w-prose text-sm text-white/60">
        Permanently delete the <span className="font-semibold text-white">entire MGG installation</span> from this VM —
        every server, world, file, backup, the database and the platform stack itself. There is no undo. You can also do
        this from the VM with{" "}
        <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs text-white/80">sudo bash deploy/uninstall.sh</code>.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          className="input sm:max-w-xs"
          placeholder={`Type ${PHRASE}`}
          value={phrase}
          onChange={(e) => setPhrase(e.target.value)}
          spellCheck={false}
        />
        <button
          onClick={destroyAll}
          disabled={phrase !== PHRASE || busy}
          className="btn-danger justify-center disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete entire installation
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-white/35">
        <CircleAlert className="h-3 w-3" /> Type the phrase exactly to enable the button, then confirm once more.
      </p>
    </div>
  );
}
