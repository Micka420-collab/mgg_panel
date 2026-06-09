"use client";
import { useEffect, useState } from "react";
import { CalendarClock, Plus, Play, Trash2, Loader2, Power, Terminal, Archive } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/util";

interface Task {
  id: string;
  action: "POWER" | "COMMAND" | "BACKUP";
  payload: string;
}
interface Schedule {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  active: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  tasks: Task[];
}

const PRESETS = [
  { label: "Nightly restart (4am)", cron: "0 4 * * *", action: "POWER", payload: "restart" },
  { label: "Daily backup (3am)", cron: "0 3 * * *", action: "BACKUP", payload: "" },
  { label: "Restart every 6h", cron: "0 */6 * * *", action: "POWER", payload: "restart" },
];
const ACTION_ICON = { POWER: Power, COMMAND: Terminal, BACKUP: Archive };

export function SchedulesPanel({ id, canManage }: { id: string; canManage: boolean }) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", cron: "0 4 * * *", action: "POWER" as Task["action"], payload: "restart" });
  const [busy, setBusy] = useState(false);

  const load = () =>
    api<{ schedules: Schedule[] }>(`/api/servers/${id}/schedules`)
      .then((r) => setSchedules(r.schedules))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/servers/${id}/schedules`, {
        method: "POST",
        json: { name: form.name, cron: form.cron, tasks: [{ action: form.action, payload: form.payload }] },
      });
      setCreating(false);
      setForm({ name: "", cron: "0 4 * * *", action: "POWER", payload: "restart" });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(s: Schedule) {
    await api(`/api/servers/${id}/schedules/${s.id}`, { method: "PATCH", json: { active: !s.active } }).catch((e) => setError(e.message));
    load();
  }
  async function runNow(s: Schedule) {
    await api(`/api/servers/${id}/schedules/${s.id}`, { method: "POST" }).catch((e) => setError(e.message));
    load();
  }
  async function del(s: Schedule) {
    if (
      !(await confirmDialog({
        title: "Delete this schedule?",
        description: `"${s.name}" and its tasks will be removed.`,
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    await api(`/api/servers/${id}/schedules/${s.id}`, { method: "DELETE" }).catch((e) => setError(e.message));
    load();
  }

  return (
    <div className="space-y-5">
      <div className="glass p-5">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-display font-semibold text-white"><CalendarClock className="h-4 w-4 text-cyan" /> Scheduled tasks</h3>
          {canManage && (
            <button onClick={() => setCreating((v) => !v)} className="btn-primary px-3 py-1.5 text-xs"><Plus className="h-3.5 w-3.5" /> New schedule</button>
          )}
        </div>
        <p className="mt-1 text-sm text-white/45">Automate restarts, commands and backups with cron expressions (server timezone: UTC).</p>

        {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        {creating && (
          <div className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nightly restart" /></div>
              <div><label className="label">Cron (m h dom mon dow)</label><input className="input font-mono" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} /></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.label} onClick={() => setForm({ ...form, cron: p.cron, action: p.action as Task["action"], payload: p.payload, name: form.name || p.label })} className="chip hover:border-cyan/40 hover:text-white">{p.label}</button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Action</label>
                <select className="input" value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as Task["action"] })}>
                  <option value="POWER" className="bg-surface">Power</option>
                  <option value="COMMAND" className="bg-surface">Console command</option>
                  <option value="BACKUP" className="bg-surface">Backup</option>
                </select>
              </div>
              <div>
                <label className="label">{form.action === "POWER" ? "Signal" : form.action === "COMMAND" ? "Command" : "Backup name (optional)"}</label>
                {form.action === "POWER" ? (
                  <select className="input" value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })}>
                    {["start", "restart", "stop"].map((x) => <option key={x} value={x} className="bg-surface">{x}</option>)}
                  </select>
                ) : (
                  <input className="input" value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })} placeholder={form.action === "COMMAND" ? "say Restarting in 5m" : "Nightly"} />
                )}
              </div>
            </div>
            <button onClick={create} disabled={busy || !form.name} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create schedule"}</button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-cyan" /></div>
      ) : schedules.length === 0 ? (
        <div className="glass px-4 py-10 text-center text-sm text-white/40">No schedules yet.</div>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.id} className="glass flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 rounded-full", s.active ? "bg-online" : "bg-white/25")} />
                  <span className="font-medium text-white">{s.name}</span>
                  <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-cyan-light">{s.cron}</code>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/40">
                  {s.tasks.map((t) => {
                    const Icon = ACTION_ICON[t.action];
                    return <span key={t.id} className="inline-flex items-center gap-1"><Icon className="h-3 w-3" /> {t.action.toLowerCase()}{t.payload ? ` · ${t.payload}` : ""}</span>;
                  })}
                  {s.nextRunAt && <span>· next {new Date(s.nextRunAt).toLocaleString()}</span>}
                </div>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button onClick={() => runNow(s)} className="btn-ghost px-2.5 py-1.5 text-xs" title="Run now"><Play className="h-3.5 w-3.5" /></button>
                  <button onClick={() => toggle(s)} className="btn-ghost px-2.5 py-1.5 text-xs">{s.active ? "Pause" : "Resume"}</button>
                  <button onClick={() => del(s)} className="text-white/30 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
