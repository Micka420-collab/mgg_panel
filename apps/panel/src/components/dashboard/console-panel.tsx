"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Gamepad2, Trash2, Wifi, WifiOff } from "lucide-react";
import type { ServerSocket } from "@/lib/use-server-socket";
import { cn } from "@/lib/util";

function lineClass(line: string, stream: string): string {
  if (stream === "system") return "text-console-blue";
  if (stream === "stderr" || /error|exception|severe|failed/i.test(line)) return "text-danger";
  if (/warn/i.test(line)) return "text-warn";
  if (/done \(|started|joined the game/i.test(line)) return "text-online";
  if (line.startsWith(">")) return "text-cyan-light";
  return "text-console-text";
}

export function ConsolePanel({ socket, canCommand, joinUrl }: { socket: ServerSocket; canCommand: boolean; joinUrl?: string }) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [socket.lines]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;
    socket.sendCommand(cmd);
    setHistory((h) => [...h, cmd]);
    setHistIdx(-1);
    setInput("");
    atBottom.current = true;
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = histIdx < 0 ? history.length - 1 : Math.max(0, histIdx - 1);
      if (history[idx] !== undefined) {
        setHistIdx(idx);
        setInput(history[idx]!);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx < 0) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(-1);
        setInput("");
      } else {
        setHistIdx(idx);
        setInput(history[idx]!);
      }
    }
  }

  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-white/50">
          {socket.connected ? (
            <><Wifi className="h-3.5 w-3.5 text-online" /> Live</>
          ) : (
            <><WifiOff className="h-3.5 w-3.5 text-warn" /> Reconnecting…</>
          )}
        </div>
        <div className="flex items-center gap-3">
          {joinUrl && (
            <a
              href={joinUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Se connecter via Steam et rejoindre le serveur"
              className="flex items-center gap-1.5 rounded-md bg-[#1b2838] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-[#2a475e]"
            >
              <Gamepad2 className="h-3.5 w-3.5" /> Rejoindre via Steam
            </a>
          )}
          <button onClick={socket.clear} className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white">
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="console-surface h-[440px] overflow-y-auto p-4 font-mono text-[12.5px] leading-relaxed"
      >
        {socket.lines.length === 0 && <div className="text-console-dim">Waiting for output…</div>}
        {socket.lines.map((l) => (
          <div key={l._id} className={cn("whitespace-pre-wrap break-words", lineClass(l.line, l.stream))}>
            {l.line}
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/10 bg-console-bg px-3 py-2.5">
        <ChevronRight className="h-4 w-4 text-cyan" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={!canCommand}
          placeholder={canCommand ? "Type a command and press Enter…" : "You lack permission to send commands"}
          className="flex-1 bg-transparent font-mono text-sm text-console-text outline-none placeholder:text-console-dim disabled:opacity-50"
        />
      </form>
    </div>
  );
}
