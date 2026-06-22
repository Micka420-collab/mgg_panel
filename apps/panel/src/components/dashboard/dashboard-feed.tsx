"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Info, ShieldAlert, ArrowRight, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/client";

interface Notif { id: string; level: string; message: string; read: boolean; serverId: string | null; target: string | null; createdAt: string }

const ICON: Record<string, any> = { critical: ShieldAlert, warning: AlertTriangle, info: Info };
const CLS: Record<string, string> = { critical: "text-danger", warning: "text-warn", info: "text-cyan" };

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant"; if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`; return `${Math.floor(s / 86400)} j`;
}

/** Compact "needs attention" feed on the main dashboard (latest alerts/events). */
export function DashboardFeed() {
  const [items, setItems] = useState<Notif[] | null>(null);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ notifications: Notif[]; unread: number }>("/api/notifications")
        .then((r) => { if (alive) { setItems(r.notifications.slice(0, 6)); setUnread(r.unread); } })
        .catch(() => alive && setItems([]));
    load();
    const t = setInterval(load, 30000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (items === null || items.length === 0) return null; // keep the home clean when nothing to show

  return (
    <div className="glass mt-6 p-5">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display font-semibold text-white">
          Centre de contrôle
          {unread > 0 && <span className="rounded-full bg-danger/90 px-2 py-0.5 text-[10px] font-bold text-white">{unread} à traiter</span>}
        </h2>
        <Link href="/dashboard/notifications" className="inline-flex items-center gap-1 text-sm text-cyan hover:underline">Tout voir <ArrowRight className="h-3.5 w-3.5" /></Link>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((n) => {
          const I = ICON[n.level] ?? Info;
          const inner = (
            <div className={`flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2 ${!n.read ? "border-l-2 border-l-cyan" : ""}`}>
              <I className={`mt-0.5 h-4 w-4 shrink-0 ${CLS[n.level] ?? "text-cyan"}`} />
              <span className="flex-1 text-sm text-white/75">{n.message}</span>
              {n.target && <span className="shrink-0 text-xs text-white/30">{n.target}</span>}
              <span className="shrink-0 text-xs text-white/30">{ago(n.createdAt)}</span>
            </div>
          );
          return n.serverId ? <Link key={n.id} href={`/dashboard/servers/${n.serverId}`} className="block transition hover:opacity-80">{inner}</Link> : <div key={n.id}>{inner}</div>;
        })}
      </div>
    </div>
  );
}
