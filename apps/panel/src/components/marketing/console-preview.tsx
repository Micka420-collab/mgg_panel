"use client";
import { useEffect, useState } from "react";

const SCRIPT = [
  { t: "system", text: "mgg › deploying minecraft-paper · node eu-west-1" },
  { t: "out", text: "[MGG] Pulling image itzg/minecraft-server:java21…" },
  { t: "out", text: "[MGG] Building container · 6 GB RAM · 300% CPU" },
  { t: "out", text: "[MGG] Starting server…" },
  { t: "mc", text: "[12:04:18] [Server thread/INFO]: Starting minecraft server version 1.21.4" },
  { t: "mc", text: "[12:04:19] [Server thread/INFO]: Loading properties" },
  { t: "mc", text: "[12:04:21] [Server thread/INFO]: Preparing level \"world\"" },
  { t: "mc", text: "[12:04:24] [Server thread/INFO]: Done (5.812s)! For help, type \"help\"" },
  { t: "ok", text: "● RUNNING — play.mgg.host · 12ms · 0/40 players" },
];

const color: Record<string, string> = {
  system: "text-console-blue",
  out: "text-cyan-light",
  mc: "text-console-text",
  ok: "text-online",
};

export function ConsolePreview() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (count >= SCRIPT.length) {
      const reset = setTimeout(() => setCount(0), 4200);
      return () => clearTimeout(reset);
    }
    const delay = count === 0 ? 500 : 380 + Math.random() * 420;
    const id = setTimeout(() => setCount((c) => c + 1), delay);
    return () => clearTimeout(id);
  }, [count]);

  return (
    <div className="glass-raised overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-danger/80" />
        <span className="h-3 w-3 rounded-full bg-warn/80" />
        <span className="h-3 w-3 rounded-full bg-online/80" />
        <span className="ml-3 font-mono text-xs text-white/40">mgg — live console</span>
      </div>
      <div className="console-surface h-[300px] overflow-hidden p-4 font-mono text-[12.5px] leading-relaxed">
        {SCRIPT.slice(0, count).map((line, i) => (
          <div key={i} className={color[line.t]}>
            {line.text}
          </div>
        ))}
        {count < SCRIPT.length && <span className="inline-block h-3.5 w-2 animate-pulse-dot bg-cyan align-middle" />}
      </div>
    </div>
  );
}
