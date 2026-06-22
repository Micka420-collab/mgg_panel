"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Gamepad2,
  Trash2,
  Wifi,
  WifiOff,
  Search,
  Copy,
  Download,
  ArrowDownToLine,
  X,
  Plus,
  Zap,
} from "lucide-react";
import type { ServerSocket } from "@/lib/use-server-socket";
import { cn } from "@/lib/util";
import { toast } from "@/components/ui/confirm";

type Severity = "error" | "warn" | "info";

function severity(line: string, stream: string): Severity {
  if (stream === "stderr" || /error|exception|severe|failed|fatal/i.test(line)) return "error";
  if (/warn/i.test(line)) return "warn";
  return "info";
}

function lineClass(line: string, stream: string): string {
  if (stream === "system") return "text-console-blue";
  if (stream === "stderr" || /error|exception|severe|failed/i.test(line)) return "text-danger";
  if (/warn/i.test(line)) return "text-warn";
  if (/done \(|started|joined the game/i.test(line)) return "text-online";
  if (line.startsWith(">")) return "text-cyan-light";
  return "text-console-text";
}

/** Highlight every case-insensitive occurrence of `q` inside `text`. */
function highlight(text: string, q: string): React.ReactNode {
  if (!q) return text;
  const parts: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  const lower = q.toLowerCase();
  // guard against pathological loops
  while (rest.length > 0 && key < 200) {
    const at = rest.toLowerCase().indexOf(lower);
    if (at === -1) {
      parts.push(rest);
      break;
    }
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(
      <mark key={key++} className="rounded-sm bg-warn/30 text-warn">
        {rest.slice(at, at + q.length)}
      </mark>,
    );
    rest = rest.slice(at + q.length);
  }
  return parts;
}

// Common server commands — surfaced as prefix suggestions while typing.
const COMMON_COMMANDS = [
  "list",
  "say ",
  "stop",
  "restart",
  "save-all",
  "seed",
  "weather clear",
  "weather rain",
  "time set day",
  "time set night",
  "difficulty peaceful",
  "difficulty normal",
  "difficulty hard",
  "gamemode survival ",
  "gamemode creative ",
  "op ",
  "deop ",
  "whitelist add ",
  "whitelist on",
  "ban ",
  "pardon ",
  "kick ",
  "tp ",
  "give ",
  "xp add ",
  "kill ",
];

type FilterMode = "all" | "warn" | "error";

export function ConsolePanel({
  socket,
  serverId,
  canCommand,
  joinUrl,
}: {
  socket: ServerSocket;
  serverId: string;
  canCommand: boolean;
  joinUrl?: string;
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [autoscroll, setAutoscroll] = useState(true);
  const [atBottomState, setAtBottomState] = useState(true);
  const [macros, setMacros] = useState<string[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);
  const atBottom = useRef(true);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    if (!q || !canCommand) return [];
    return COMMON_COMMANDS.filter((c) => c.toLowerCase().startsWith(q) && c.toLowerCase() !== q).slice(0, 6);
  }, [input, canCommand]);

  // Saved command macros (quick-action buttons), persisted per server.
  const macroKey = `mgg:macros:${serverId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(macroKey);
      if (raw) setMacros(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  function persistMacros(next: string[]) {
    setMacros(next);
    try {
      localStorage.setItem(macroKey, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  function addMacro() {
    const cmd = input.trim();
    if (!cmd || macros.includes(cmd) || macros.length >= 12) return;
    persistMacros([...macros, cmd]);
  }
  function removeMacro(cmd: string) {
    persistMacros(macros.filter((m) => m !== cmd));
  }
  function runMacro(cmd: string) {
    if (!canCommand) return;
    socket.sendCommand(cmd);
    setHistory((h) => [...h, cmd]);
    atBottom.current = true;
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return socket.lines.filter((l) => {
      if (filter !== "all") {
        const sev = severity(l.line, l.stream);
        if (filter === "error" && sev !== "error") return false;
        if (filter === "warn" && sev === "info") return false; // warn+error
      }
      if (q && !l.line.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [socket.lines, query, filter]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && autoscroll && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [filtered, autoscroll]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    atBottom.current = bottom;
    setAtBottomState(bottom);
  }

  function jumpToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    atBottom.current = true;
    setAtBottomState(true);
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

  const text = () => filtered.map((l) => l.line).join("\n");

  async function copyAll() {
    try {
      await navigator.clipboard.writeText(text());
      toast(`${filtered.length} ligne${filtered.length > 1 ? "s" : ""} copiée${filtered.length > 1 ? "s" : ""}`, "success");
    } catch {
      toast("Copie impossible", "error");
    }
  }

  function download() {
    const blob = new Blob([text()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `console-${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const filterChip = (mode: FilterMode, label: string, activeClass: string) => (
    <button
      onClick={() => setFilter(mode)}
      className={cn(
        "rounded-md px-2 py-1 text-[11px] font-medium transition",
        filter === mode ? activeClass : "text-white/45 hover:text-white/80",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="glass overflow-hidden">
      {/* status row */}
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-white/50">
          {socket.connected ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-online" /> Live
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-warn" /> Reconnecting…
            </>
          )}
          <span className="text-white/25">·</span>
          <span className="tabular-nums text-white/35">
            {query || filter !== "all" ? `${filtered.length}/${socket.lines.length}` : socket.lines.length} lignes
          </span>
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
          <button onClick={copyAll} title="Copier le journal" className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white">
            <Copy className="h-3.5 w-3.5" /> Copier
          </button>
          <button onClick={download} title="Télécharger en .txt" className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white">
            <Download className="h-3.5 w-3.5" /> .txt
          </button>
          <button onClick={socket.clear} title="Vider l'affichage" className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white">
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </div>

      {/* search + filter row */}
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.015] px-3 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher dans le journal…"
            spellCheck={false}
            className="w-full rounded-md border border-white/10 bg-black/30 py-1.5 pl-8 pr-7 font-mono text-xs text-white outline-none transition placeholder:text-white/25 focus:border-cyan/50"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-0.5 rounded-md border border-white/10 bg-black/20 p-0.5">
          {filterChip("all", "Tout", "bg-white/10 text-white")}
          {filterChip("warn", "Warn+", "bg-warn/20 text-warn")}
          {filterChip("error", "Erreurs", "bg-danger/20 text-danger")}
        </div>
        <button
          onClick={() => setAutoscroll((v) => !v)}
          title="Défilement automatique"
          className={cn(
            "rounded-md border px-2 py-1.5 text-[11px] font-medium transition",
            autoscroll ? "border-cyan/40 bg-cyan/10 text-cyan-light" : "border-white/10 bg-black/20 text-white/45 hover:text-white/80",
          )}
        >
          Auto-scroll
        </button>
      </div>

      {/* output */}
      <div className="relative">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="console-surface h-[440px] overflow-y-auto p-4 font-mono text-[12.5px] leading-relaxed"
        >
          {socket.lines.length === 0 && <div className="text-console-dim">En attente de sortie…</div>}
          {socket.lines.length > 0 && filtered.length === 0 && (
            <div className="text-console-dim">Aucune ligne ne correspond au filtre.</div>
          )}
          {filtered.map((l) => (
            <div key={l._id} className={cn("whitespace-pre-wrap break-words", lineClass(l.line, l.stream))}>
              {query ? highlight(l.line, query.trim()) : l.line}
            </div>
          ))}
        </div>
        {!atBottomState && (
          <button
            onClick={jumpToBottom}
            title="Aller en bas"
            className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full border border-white/15 bg-surface/90 text-cyan-light shadow-lg backdrop-blur transition hover:bg-surface"
          >
            <ArrowDownToLine className="h-4 w-4" />
          </button>
        )}
      </div>

      {canCommand && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 bg-white/[0.015] px-3 py-2">
          <span className="flex items-center gap-1 text-[11px] text-white/35">
            <Zap className="h-3 w-3" /> Macros
          </span>
          {macros.map((m) => (
            <span key={m} className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-black/30 py-1 pl-2 pr-1 text-xs">
              <button onClick={() => runMacro(m)} className="max-w-[180px] truncate font-mono text-cyan-light hover:text-cyan" title={`Exécuter : ${m}`}>
                {m}
              </button>
              <button onClick={() => removeMacro(m)} className="text-white/25 hover:text-danger" title="Retirer">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {input.trim() && !macros.includes(input.trim()) && macros.length < 12 && (
            <button
              onClick={addMacro}
              title="Enregistrer la commande en cours comme macro"
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-white/15 px-2 py-1 text-xs text-white/45 transition hover:border-cyan/40 hover:text-cyan-light"
            >
              <Plus className="h-3 w-3" /> Enregistrer
            </button>
          )}
          {macros.length === 0 && !input.trim() && (
            <span className="text-[11px] text-white/25">tape une commande puis « Enregistrer » pour créer un raccourci</span>
          )}
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-white/10 bg-white/[0.015] px-3 py-1.5">
          {suggestions.map((c) => (
            <button
              key={c}
              onClick={() => {
                setInput(c);
                cmdInputRef.current?.focus();
              }}
              className="rounded-md border border-white/10 bg-black/20 px-2 py-1 font-mono text-[11px] text-white/55 transition hover:border-cyan/40 hover:text-cyan-light"
            >
              {c}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-white/10 bg-console-bg px-3 py-2.5">
        <ChevronRight className="h-4 w-4 text-cyan" />
        <input
          ref={cmdInputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          disabled={!canCommand}
          placeholder={canCommand ? "Tape une commande puis Entrée…" : "Tu n'as pas la permission d'envoyer des commandes"}
          className="flex-1 bg-transparent font-mono text-sm text-console-text outline-none placeholder:text-console-dim disabled:opacity-50"
        />
      </form>
    </div>
  );
}
