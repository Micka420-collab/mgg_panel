"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, CheckCheck, Loader2, AlertTriangle, Info, ShieldAlert, ExternalLink } from "lucide-react";
import { api } from "@/lib/client";

interface Notif {
  id: string;
  level: string;
  message: string;
  resolved: boolean;
  read: boolean;
  serverId: string | null;
  target: string | null;
  createdAt: string;
}

const LEVEL: Record<string, { icon: any; cls: string }> = {
  critical: { icon: ShieldAlert, cls: "text-danger" },
  warning: { icon: AlertTriangle, cls: "text-warn" },
  info: { icon: Info, cls: "text-cyan" },
};

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const load = useCallback(async () => {
    try {
      const r = await api<{ notifications: Notif[] }>("/api/notifications");
      setItems(r.notifications);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function markRead(ids?: string[]) {
    await api("/api/notifications", { method: "PATCH", json: ids ? { ids } : { all: true } }).catch(() => {});
    window.dispatchEvent(new Event("mgg:notifications-read"));
    await load();
  }

  const shown = filter === "unread" ? items.filter((n) => !n.read) : items;
  const unread = items.filter((n) => !n.read).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-white">
            <Bell className="h-6 w-6 text-cyan" /> Notifications
          </h1>
          <p className="mt-1 text-sm text-white/50">Crashs, sécurité, sauvegardes et analyses IA de tes serveurs.</p>
        </div>
        {unread > 0 && (
          <button onClick={() => markRead()} className="btn-ghost text-sm">
            <CheckCheck className="h-4 w-4" /> Tout marquer comme lu ({unread})
          </button>
        )}
      </div>

      <div className="mt-5 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1 text-sm">
        {(["all", "unread"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 transition ${filter === f ? "bg-cyan/15 text-white" : "text-white/50 hover:text-white"}`}
          >
            {f === "all" ? "Toutes" : `Non lues${unread ? ` (${unread})` : ""}`}
          </button>
        ))}
      </div>

      <div className="mt-5 space-y-2">
        {loading ? (
          <div className="glass flex items-center gap-2 p-6 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : shown.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 p-12 text-center text-white/40">
            <Bell className="h-8 w-8" /> Aucune notification {filter === "unread" ? "non lue" : ""}.
          </div>
        ) : (
          shown.map((n) => {
            const L = LEVEL[n.level] ?? LEVEL.info;
            return (
              <div
                key={n.id}
                className={`glass flex items-start gap-3 p-4 ${!n.read ? "border-l-2 border-l-cyan" : "opacity-70"}`}
              >
                <L.icon className={`mt-0.5 h-5 w-5 shrink-0 ${L.cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-white">{n.message}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-white/40">
                    <span>{ago(n.createdAt)}</span>
                    {n.target && <span>· {n.target}</span>}
                    {n.resolved && <span className="text-online">· résolu</span>}
                    {n.serverId && (
                      <Link href={`/dashboard/servers/${n.serverId}`} className="inline-flex items-center gap-1 text-cyan hover:underline">
                        <ExternalLink className="h-3 w-3" /> Ouvrir
                      </Link>
                    )}
                  </div>
                </div>
                {!n.read && (
                  <button onClick={() => markRead([n.id])} title="Marquer comme lu" className="rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white">
                    <Check className="h-4 w-4" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
