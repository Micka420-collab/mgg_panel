"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Server, Users, HardDrive, Plus, Loader2, CircleCheck, CircleX, BellRing, ArrowRight } from "lucide-react";
import { api } from "@/lib/client";
import { cn, relativeTime } from "@/lib/util";
import { DdnsCard } from "@/components/dashboard/ddns-card";
import { AiKeyCard } from "@/components/dashboard/ai-key-card";
import { EmailSettingsCard } from "@/components/dashboard/email-settings-card";
import { UpdateCard } from "@/components/dashboard/update-card";

interface AlertView {
  id: string;
  level: string;
  message: string;
  resolved: boolean;
  target: string | null;
  updatedAt: string;
}

interface NodeView {
  id: string;
  name: string;
  fqdn: string;
  scheme: string;
  daemonPort: number;
  publicIp: string;
  maintenance: boolean;
  servers: number;
  allocations: number;
  online: boolean;
  system: any;
}

export default function AdminPage() {
  const [data, setData] = useState<{ nodes: NodeView[]; totals: any } | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", fqdn: "localhost", publicIp: "127.0.0.1", daemonPort: 8080 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [alerts, setAlerts] = useState<AlertView[]>([]);
  const load = () => api<{ nodes: NodeView[]; totals: any }>("/api/admin/nodes").then(setData).catch((e) => setError(e.message));
  const loadAlerts = () => api<{ alerts: AlertView[] }>("/api/admin/alerts").then((r) => setAlerts(r.alerts)).catch(() => {});
  useEffect(() => {
    load();
    loadAlerts();
  }, []);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/nodes", { method: "POST", json: { ...form, daemonPort: Number(form.daemonPort) } });
      setAdding(false);
      setForm({ name: "", fqdn: "localhost", publicIp: "127.0.0.1", daemonPort: 8080 });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <Loader2 className="h-6 w-6 animate-spin text-cyan" />;

  const totals = [
    { icon: Users, label: "Users", value: data.totals.users },
    { icon: Server, label: "Servers", value: data.totals.servers },
    { icon: HardDrive, label: "Nodes", value: data.totals.nodes },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Admin</h1>
          <p className="mt-1 text-sm text-white/50">Platform overview and node management.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/admin/users" className="btn-ghost"><Users className="h-4 w-4" /> Utilisateurs & permissions</Link>
          <button onClick={() => setAdding((v) => !v)} className="btn-primary"><Plus className="h-4 w-4" /> Add node</button>
        </div>
      </div>

      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <UpdateCard />
      <AiKeyCard />
      <EmailSettingsCard />
      <DdnsCard />


      <div className="grid grid-cols-3 gap-4">
        {totals.map((t) => (
          <div key={t.label} className="glass p-5">
            <div className="flex items-center gap-2 text-xs text-white/40"><t.icon className="h-4 w-4" /> {t.label}</div>
            <div className="mt-1 font-display text-3xl font-bold text-white">{t.value}</div>
          </div>
        ))}
      </div>

      {adding && (
        <div className="glass p-5">
          <h3 className="font-display font-semibold text-white">New node</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><label className="label">Daemon FQDN</label><input className="input" value={form.fqdn} onChange={(e) => setForm({ ...form, fqdn: e.target.value })} /></div>
            <div><label className="label">Public IP</label><input className="input" value={form.publicIp} onChange={(e) => setForm({ ...form, publicIp: e.target.value })} /></div>
            <div><label className="label">Daemon port</label><input className="input" type="number" value={form.daemonPort} onChange={(e) => setForm({ ...form, daemonPort: Number(e.target.value) })} /></div>
          </div>
          <button onClick={create} disabled={busy || !form.name} className="btn-primary mt-4">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create node"}</button>
        </div>
      )}

      <div className="glass overflow-hidden">
        <div className="border-b border-white/10 px-4 py-3 font-medium text-white">Game nodes</div>
        {data.nodes.map((n) => (
          <div key={n.id} className="flex items-center justify-between border-b border-white/5 px-4 py-3 last:border-0">
            <div>
              <div className="flex items-center gap-2 font-medium text-white">
                {n.name}
                <span className={cn("inline-flex items-center gap-1 text-xs", n.online ? "text-online" : "text-danger")}>
                  {n.online ? <CircleCheck className="h-3.5 w-3.5" /> : <CircleX className="h-3.5 w-3.5" />}
                  {n.online ? "online" : "offline"}
                </span>
              </div>
              <div className="font-mono text-xs text-white/40">{n.scheme}://{n.fqdn}:{n.daemonPort} · {n.publicIp}</div>
            </div>
            <div className="text-right text-xs text-white/50">
              <div>{n.servers} servers · {n.allocations} allocations</div>
              {n.system && <div className="text-white/30">{n.system.cpus} CPU · Docker {n.system.docker?.version ?? "n/a"}</div>}
            </div>
          </div>
        ))}
      </div>

      <div className="glass overflow-hidden">
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-medium text-white">
          <BellRing className="h-4 w-4 text-cyan" /> Alerts
        </div>
        {alerts.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-white/30">All clear — no alerts.</div>
        ) : (
          alerts.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-b border-white/5 px-4 py-2.5 text-sm last:border-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    a.resolved ? "bg-online" : a.level === "critical" ? "bg-danger" : a.level === "warning" ? "bg-warn" : "bg-cyan",
                  )}
                />
                <span className={a.resolved ? "text-white/40 line-through" : "text-white/85"}>{a.message}</span>
                {a.target && <span className="text-xs text-white/30">· {a.target}</span>}
              </div>
              <span className="text-xs text-white/30">{relativeTime(a.updatedAt)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
