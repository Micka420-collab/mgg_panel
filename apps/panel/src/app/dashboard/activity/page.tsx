"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ScrollText, Loader2, User as UserIcon, Server as ServerIcon, Globe, ExternalLink } from "lucide-react";
import { api } from "@/lib/client";

interface LogRow {
  id: string;
  action: string;
  user: string | null;
  server: string | null;
  serverId: string | null;
  metadata: any;
  ip: string | null;
  createdAt: string;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

/** Human label + accent for known audit actions. */
function actionStyle(a: string): string {
  if (a.includes("delete") || a.includes("destroy")) return "text-danger";
  if (a.includes("create") || a.includes("restart") || a.includes("start")) return "text-online";
  if (a.includes("login") || a.includes("auth")) return "text-cyan";
  return "text-white/70";
}

export default function ActivityPage() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = action ? `?action=${encodeURIComponent(action)}` : "";
      const r = await api<{ logs: LogRow[]; actions: string[] }>(`/api/activity${q}`);
      setLogs(r.logs);
      if (r.actions?.length) setActions(r.actions);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-white">
            <ScrollText className="h-6 w-6 text-cyan" /> Journal d'activité
          </h1>
          <p className="mt-1 text-sm text-white/50">Qui a fait quoi, quand : connexions, actions serveur, changements.</p>
        </div>
        <select className="input max-w-xs" value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="" className="bg-surface">Toutes les actions</option>
          {actions.map((a) => (
            <option key={a} value={a} className="bg-surface">{a}</option>
          ))}
        </select>
      </div>

      <div className="glass mt-6 overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-white/40"><ScrollText className="h-8 w-8" /> Aucune activité enregistrée.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className={`font-mono ${actionStyle(l.action)}`}>{l.action}</span>
                <span className="flex items-center gap-3 text-xs text-white/45">
                  {l.user && <span className="inline-flex items-center gap-1"><UserIcon className="h-3 w-3" /> {l.user}</span>}
                  {l.server && (
                    l.serverId ? (
                      <Link href={`/dashboard/servers/${l.serverId}`} className="inline-flex items-center gap-1 hover:text-cyan">
                        <ServerIcon className="h-3 w-3" /> {l.server} <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    ) : (
                      <span className="inline-flex items-center gap-1"><ServerIcon className="h-3 w-3" /> {l.server}</span>
                    )
                  )}
                  {l.ip && <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> {l.ip}</span>}
                </span>
                <span className="ml-auto text-xs text-white/30">{when(l.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
