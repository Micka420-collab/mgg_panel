"use client";
import { useEffect, useMemo, useState } from "react";
import { Users2, Plus, Trash2, Loader2, Save, ChevronDown } from "lucide-react";
import { SCOPES, SCOPE_PRESETS } from "@mgg/shared";
import { api } from "@/lib/client";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/util";

interface Subuser {
  id: string;
  userId: string;
  username: string;
  email: string;
  scopes: string[];
}

const GROUP_LABELS: Record<string, string> = {
  control: "Power & console",
  file: "Files",
  backup: "Backups",
  allocation: "Network",
  startup: "Startup",
  settings: "Settings",
  schedule: "Schedules",
  subuser: "Sub-users",
  players: "Players",
};

const GROUPED = Object.entries(SCOPES).reduce<Record<string, { key: string; label: string }[]>>((acc, [key, label]) => {
  const g = key.split(".")[0]!;
  (acc[g] ||= []).push({ key, label });
  return acc;
}, {});

function ScopePicker({ value, onChange }: { value: Set<string>; onChange: (s: Set<string>) => void }) {
  const toggle = (k: string) => {
    const next = new Set(value);
    next.has(k) ? next.delete(k) : next.add(k);
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/40">Presets :</span>
        {SCOPE_PRESETS.map((p) => (
          <button key={p.key} type="button" onClick={() => onChange(new Set(p.scopes))} title={p.description} className="chip hover:border-cyan/40 hover:text-white">{p.label}</button>
        ))}
        <button type="button" onClick={() => onChange(new Set())} className="chip hover:border-cyan/40 hover:text-white">Aucune</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(GROUPED).map(([group, scopes]) => (
        <div key={group}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">{GROUP_LABELS[group] ?? group}</div>
          <div className="space-y-1.5">
            {scopes.map((s) => (
              <label key={s.key} className="flex cursor-pointer items-start gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={value.has(s.key)}
                  onChange={() => toggle(s.key)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 accent-cyan"
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
      </div>
    </div>
  );
}

export function SubusersPanel({ id }: { id: string }) {
  const [subs, setSubs] = useState<Subuser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [newScopes, setNewScopes] = useState<Set<string>>(new Set(["control.console", "control.start", "control.stop"]));
  const [editing, setEditing] = useState<string | null>(null);
  const [editScopes, setEditScopes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ subusers: Subuser[] }>(`/api/servers/${id}/subusers`)
      .then((r) => setSubs(r.subusers))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/servers/${id}/subusers`, { method: "POST", json: { email, scopes: [...newScopes] } });
      setAdding(false);
      setEmail("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveEdit(uid: string) {
    setBusy(true);
    try {
      await api(`/api/servers/${id}/subusers/${uid}`, { method: "PATCH", json: { scopes: [...editScopes] } });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(uid: string) {
    if (
      !(await confirmDialog({
        title: "Remove this sub-user?",
        description: "They will immediately lose access to this server.",
        danger: true,
        confirmLabel: "Remove",
      }))
    )
      return;
    await api(`/api/servers/${id}/subusers/${uid}`, { method: "DELETE" }).catch((e) => setError(e.message));
    load();
  }

  return (
    <div className="space-y-5">
      <div className="glass p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Users2 className="h-4 w-4 text-cyan" /> Sub-users</h3>
          <button onClick={() => setAdding((v) => !v)} className="btn-primary px-3 py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> Invite</button>
        </div>
        <p className="mt-1 text-sm text-white/45">Give teammates scoped access to this server. They sign in with their own MGG account.</p>

        {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        {adding && (
          <div className="mt-4 space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="max-w-sm">
              <label className="label">Their account email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
            </div>
            <div>
              <div className="label">Permissions</div>
              <ScopePicker value={newScopes} onChange={setNewScopes} />
            </div>
            <button onClick={add} disabled={busy || !email} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add sub-user"}</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-cyan" /></div>
      ) : subs.length === 0 ? (
        <div className="glass px-4 py-10 text-center text-sm text-white/40">No sub-users yet.</div>
      ) : (
        <div className="space-y-3">
          {subs.map((s) => (
            <div key={s.id} className="glass p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-violet text-sm font-semibold text-white">{s.username.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <div className="font-medium text-white">{s.username}</div>
                    <div className="text-xs text-white/40">{s.email} · {s.scopes.length} permission{s.scopes.length === 1 ? "" : "s"}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setEditing(editing === s.userId ? null : s.userId); setEditScopes(new Set(s.scopes)); }}
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                  >
                    Edit <ChevronDown className={cn("h-3.5 w-3.5 transition", editing === s.userId && "rotate-180")} />
                  </button>
                  <button onClick={() => remove(s.userId)} className="text-white/30 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
              {editing === s.userId && (
                <div className="mt-4 border-t border-white/10 pt-4">
                  <ScopePicker value={editScopes} onChange={setEditScopes} />
                  <button onClick={() => saveEdit(s.userId)} disabled={busy} className="btn-primary mt-4 px-3 py-1.5 text-xs"><Save className="h-3.5 w-3.5" /> Save permissions</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
