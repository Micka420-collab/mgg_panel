"use client";
import { useEffect, useState } from "react";
import { Archive, Plus, Loader2, RotateCcw, Trash2, Lock } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog } from "@/components/ui/confirm";
import { formatBytes, relativeTime } from "@/lib/util";

interface Backup {
  id: string;
  name: string;
  sizeBytes: number;
  completed: boolean;
  locked: boolean;
  createdAt: string;
}

export function BackupsPanel({
  id,
  canCreate,
  canDelete,
  canRestore,
}: {
  id: string;
  canCreate: boolean;
  canDelete: boolean;
  canRestore: boolean;
}) {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api<{ backups: Backup[] }>(`/api/servers/${id}/backups`).then((r) => setBackups(r.backups)).catch((e) => setError(e.message)).finally(() => setLoading(false));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function create() {
    setCreating(true);
    setError(null);
    try {
      await api(`/api/servers/${id}/backups`, { method: "POST", json: {} });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function restore(b: Backup) {
    if (
      !(await confirmDialog({
        title: "Restore this backup?",
        description: `Restoring "${b.name}" stops the server and overwrites the current world with the backup.`,
        danger: true,
        confirmLabel: "Restore",
      }))
    )
      return;
    setRestoring(b.id);
    setError(null);
    setMsg(null);
    try {
      await api(`/api/servers/${id}/backups/${b.id}`, { method: "POST" });
      setMsg(`Restored "${b.name}". Start the server to load it.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRestoring(null);
      load();
    }
  }
  async function del(b: Backup) {
    if (
      !(await confirmDialog({
        title: "Delete this backup?",
        description: `"${b.name}" will be permanently removed.`,
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    await api(`/api/servers/${id}/backups/${b.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    load();
  }

  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <h3 className="flex items-center gap-2 font-medium text-white"><Archive className="h-4 w-4 text-cyan" /> Backups</h3>
        {canCreate && (
          <button onClick={create} disabled={creating} className="btn-primary px-3 py-1.5 text-xs">
            {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create backup
          </button>
        )}
      </div>
      {error && <div className="border-b border-danger/20 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>}
      {msg && <div className="border-b border-online/20 bg-online/10 px-4 py-2 text-sm text-online">{msg}</div>}
      {loading ? (
        <div className="flex h-32 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-cyan" /></div>
      ) : backups.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-white/40">No backups yet. Create your first snapshot.</div>
      ) : (
        <div>
          {backups.map((b) => (
            <div key={b.id} className="flex items-center justify-between border-b border-white/5 px-4 py-3 last:border-0">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-white">
                  {b.locked && <Lock className="h-3.5 w-3.5 text-warn" />}
                  {b.name}
                </div>
                <div className="text-xs text-white/40">
                  {formatBytes(b.sizeBytes)} · {relativeTime(b.createdAt)}
                  {!b.completed && " · pending"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {canRestore && (
                  <button onClick={() => restore(b)} disabled={!!restoring} className="btn-ghost px-2.5 py-1.5 text-xs disabled:opacity-40">
                    {restoring === b.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore
                  </button>
                )}
                {canDelete && !b.locked && (
                  <button onClick={() => del(b)} className="text-white/30 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
