"use client";
import { useCallback, useEffect, useState } from "react";
import { Copy, Check, Users, Circle, Moon, Loader2, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/util";

export interface PublicServer {
  name: string;
  game: string;
  state: string;
  online: boolean;
  players: { online: number; max: number; sample: string[] };
  address: string;
  motd: string | null;
  version: string | null;
  sleeping: boolean;
  joinable: boolean;
}

function stateLabel(s: PublicServer): { text: string; color: string; dot: string } {
  if (s.online) return { text: "Online", color: "text-online", dot: "text-online" };
  if (s.sleeping) return { text: "Sleeping", color: "text-violet-light", dot: "text-violet" };
  if (s.state === "starting" || s.state === "installing") return { text: "Starting…", color: "text-warn", dot: "text-warn" };
  if (s.state === "errored") return { text: "Having trouble", color: "text-danger", dot: "text-danger" };
  return { text: "Offline", color: "text-white/40", dot: "text-white/30" };
}

/** Short, friendly "how to join" line that adapts to the live state. */
function joinHint(s: PublicServer): string {
  if (s.joinable) return "Add the address in your game's server list and jump in.";
  if (s.sleeping) return "💤 It's asleep — just connect and it wakes up automatically (give it ~30s).";
  if (s.state === "starting" || s.state === "installing") return "Booting up — it'll be joinable in a moment.";
  if (s.state === "errored") return "Currently having trouble. Check back shortly.";
  return "Currently offline. Check back soon.";
}

export function PublicServerCard({ initial, subdomain }: { initial: PublicServer; subdomain: string }) {
  const [data, setData] = useState<PublicServer>(initial);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/public/${encodeURIComponent(subdomain)}`, { cache: "no-store" });
      if (res.ok) setData((await res.json()) as PublicServer);
    } catch {
      /* keep last-known data */
    } finally {
      setRefreshing(false);
    }
  }, [subdomain]);

  useEffect(() => {
    const t = setInterval(refresh, 15_000); // live-ish
    return () => clearInterval(t);
  }, [refresh]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the address is shown for manual copy */
    }
  }, [data.address]);

  const st = stateLabel(data);

  return (
    <div className="glass-raised w-full max-w-lg overflow-hidden p-0">
      {/* header */}
      <div className="relative border-b border-white/10 bg-gradient-to-br from-cyan/10 to-violet/10 px-6 py-5">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-white/40">
          <Gamepad2 className="h-3.5 w-3.5 text-cyan" />
          {data.game}
        </div>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-white">{data.name}</h1>
        {data.motd && <p className="mt-1.5 text-sm text-white/55">{data.motd}</p>}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <Circle className={cn("h-2.5 w-2.5 fill-current", st.dot, data.online && "animate-pulse-dot")} />
          <span className={cn("font-medium", st.color)}>{st.text}</span>
          {refreshing && <Loader2 className="h-3 w-3 animate-spin text-white/30" />}
        </div>
      </div>

      {/* connect */}
      <div className="space-y-4 px-6 py-5">
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-white/35">Address</div>
          <button
            onClick={copy}
            className="group flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left transition hover:border-cyan/40"
          >
            <span className="truncate font-mono text-base text-white">{data.address || "—"}</span>
            <span className={cn("flex shrink-0 items-center gap-1.5 text-xs font-medium", copied ? "text-online" : "text-cyan")}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Copy"}
            </span>
          </button>
          <p className="mt-2 text-sm text-white/50">{joinHint(data)}</p>
        </div>

        {/* players */}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          <Users className="h-4 w-4 text-online" />
          <span className="text-sm text-white/70">
            <span className="font-semibold text-white">{data.players.online}</span>
            {data.players.max > 0 && <span className="text-white/40"> / {data.players.max}</span>} online
          </span>
          {data.sleeping && (
            <span className="ml-auto flex items-center gap-1 text-xs text-violet-light">
              <Moon className="h-3.5 w-3.5" /> wakes on join
            </span>
          )}
        </div>

        {data.players.sample.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {data.players.sample.map((name) => (
              <span key={name} className="rounded-md bg-white/5 px-2 py-1 text-xs text-white/60">
                {name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
