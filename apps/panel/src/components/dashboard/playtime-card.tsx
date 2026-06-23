"use client";
import { useEffect, useState } from "react";
import { Clock, Trophy } from "lucide-react";
import { api } from "@/lib/client";
import { formatUptime } from "@/lib/util";

interface PlaytimeRow {
  name: string;
  steamId: string;
  totalSeconds: number;
  sessions: number;
  lastSeenAt: string;
}

/**
 * Playtime leaderboard for a server — total time per player, accumulated by the
 * daemon on each disconnect. Renders nothing until there's data.
 */
export function PlaytimeCard({ serverId }: { serverId: string }) {
  const [rows, setRows] = useState<PlaytimeRow[] | null>(null);

  useEffect(() => {
    api<{ players: PlaytimeRow[] }>(`/api/servers/${serverId}/playtime`)
      .then((r) => setRows(r.players))
      .catch(() => setRows([]));
  }, [serverId]);

  if (!rows || rows.length === 0) return null;
  const medal = (i: number) => (i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`);

  return (
    <div className="glass mt-5 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-medium text-white">
        <Trophy className="h-4 w-4 text-warn" /> Temps de jeu
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((r, i) => (
          <div key={r.steamId} className="flex items-center justify-between px-4 py-2.5 text-sm">
            <span className="flex items-center gap-2.5">
              <span className="w-6 text-center text-white/45">{medal(i)}</span>
              <span className="text-white">{r.name}</span>
            </span>
            <span className="flex items-center gap-3 text-white/50">
              <span className="text-xs">
                {r.sessions} session{r.sessions > 1 ? "s" : ""}
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-cyan-light">
                <Clock className="h-3.5 w-3.5" /> {formatUptime(r.totalSeconds)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
