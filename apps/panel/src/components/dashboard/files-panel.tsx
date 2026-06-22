"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Folder, FileText, ChevronRight, Save, Trash2, FolderPlus, Loader2, ArrowUp, X, Upload,
} from "lucide-react";
import type { FileEntry } from "@mgg/shared";
import { api } from "@/lib/client";
import { confirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { formatBytes } from "@/lib/util";

export function FilesPanel({ id, canWrite, canDelete }: { id: string; canWrite: boolean; canDelete: boolean }) {
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ path: string; content: string; original: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const list = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<{ path: string; entries: FileEntry[] }>(`/api/servers/${id}/files?path=${encodeURIComponent(p)}`);
      setEntries(res.entries);
      setPath(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    list("/");
  }, [list]);

  async function openFile(p: string) {
    try {
      const res = await api<{ content: string }>(`/api/servers/${id}/files/content?path=${encodeURIComponent(p)}`);
      setEditing({ path: p, content: res.content, original: res.content });
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      await api(`/api/servers/${id}/files`, { method: "PUT", json: { path: editing.path, content: editing.content } });
      setEditing(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function closeEditor() {
    if (editing && editing.content !== editing.original) {
      if (
        !(await confirmDialog({
          title: "Fermer sans enregistrer ?",
          description: "Les modifications non enregistrées seront perdues.",
          danger: true,
          confirmLabel: "Fermer",
        }))
      )
        return;
    }
    setEditing(null);
  }

  // Editor keyboard shortcuts: Esc closes (with the unsaved guard), Ctrl/Cmd+S saves.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void closeEditor();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (canWrite) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, canWrite]);

  async function del(p: string) {
    if (
      !(await confirmDialog({
        title: "Delete this item?",
        description: `Delete ${p}? This cannot be undone.`,
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    await api(`/api/servers/${id}/files?path=${encodeURIComponent(p)}`, { method: "DELETE" }).catch((e) => setError(e.message));
    list(path);
  }

  async function mkdir() {
    const name = prompt("New folder name:");
    if (!name) return;
    await api(`/api/servers/${id}/files`, { method: "POST", json: { op: "mkdir", path: `${path}/${name}` } }).catch((e) => setError(e.message));
    list(path);
  }

  async function importArchive(file: File) {
    setImporting(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${id}/import?name=${encodeURIComponent(file.name)}&clear=0`, {
        method: "POST",
        body: file,
        credentials: "include",
      });
      if (!res.ok) {
        const t = await res.json().catch(() => ({} as any));
        throw new Error(t.error || `Import failed (${res.status})`);
      }
      list("/");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }

  const parent = path === "/" ? null : path.split("/").slice(0, -1).join("/") || "/";
  const crumbs = path.split("/").filter(Boolean);

  return (
    <div className="glass overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-1 text-sm text-white/60">
          <button onClick={() => list("/")} className="hover:text-white">/</button>
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-white/30" />
              <button onClick={() => list("/" + crumbs.slice(0, i + 1).join("/"))} className="hover:text-white">{c}</button>
            </span>
          ))}
        </div>
        {canWrite && (
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-white/50 hover:text-white" title="Upload a .zip / .tar.gz and extract it into this server">
              <input
                type="file"
                accept=".zip,.tar.gz,.tgz,.tar,application/zip,application/gzip,application/x-tar"
                className="hidden"
                disabled={importing}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = "";
                  if (f) importArchive(f);
                }}
              />
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Import archive
            </label>
            <button onClick={mkdir} className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white">
              <FolderPlus className="h-4 w-4" /> New folder
            </button>
          </div>
        )}
      </div>

      {error && <div className="border-b border-danger/20 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="flex h-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-cyan" /></div>
      ) : (
        <div className="max-h-[460px] overflow-y-auto">
          {parent !== null && (
            <button onClick={() => list(parent)} className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-white/60 hover:bg-white/5">
              <ArrowUp className="h-4 w-4" /> ..
            </button>
          )}
          {entries.map((e) => (
            <div key={e.path} className="group flex items-center justify-between px-4 py-2.5 text-sm hover:bg-white/5">
              <button
                onClick={() => (e.isDir ? list(e.path) : openFile(e.path))}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                {e.isDir ? <Folder className="h-4 w-4 shrink-0 text-cyan" /> : <FileText className="h-4 w-4 shrink-0 text-white/40" />}
                <span className="truncate text-white/85">{e.name}</span>
              </button>
              <div className="flex items-center gap-4">
                {!e.isDir && <span className="text-xs text-white/30">{formatBytes(e.size)}</span>}
                {canDelete && (
                  <button onClick={() => del(e.path)} aria-label={`Supprimer ${e.name}`} className="text-white/20 opacity-0 transition group-hover:opacity-100 hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {entries.length === 0 && <EmptyState icon={Folder} title="Dossier vide" />}
        </div>
      )}

      {/* editor modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={closeEditor}>
          <div className="glass-raised flex h-[80vh] w-full max-w-4xl flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <span className="font-mono text-sm text-white/70">
                {editing.path}
                {editing.content !== editing.original && <span className="ml-2 not-italic text-warn">● non enregistré</span>}
              </span>
              <div className="flex items-center gap-2">
                {canWrite && (
                  <button onClick={save} disabled={saving} className="btn-primary px-3 py-1.5 text-xs">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save
                  </button>
                )}
                <button onClick={closeEditor} aria-label="Fermer l'éditeur" className="btn-ghost px-2 py-1.5"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <textarea
              autoFocus
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              readOnly={!canWrite}
              spellCheck={false}
              className="console-surface flex-1 resize-none p-4 font-mono text-[13px] leading-relaxed text-console-text outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
