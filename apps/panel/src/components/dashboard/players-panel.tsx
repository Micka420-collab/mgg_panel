"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Users2, ShieldCheck, LogOut, Ban, UserCheck, ListChecks,
  RefreshCw, Loader2, Send, ChevronDown, ChevronUp,
} from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/util";

interface PlayersResponse {
  players: { online: number; max: number; sample: string[] };
  online: boolean;
}

/** Quick per-player actions, each a single RCON console command. */
type Action = "op" | "deop" | "kick" | "ban" | "pardon" | "whitelist-add" | "whitelist-remove";

const ACTION_VERB: Record<Action, string> = {
  op: "op",
  deop: "deop",
  kick: "kick",
  ban: "ban",
  pardon: "pardon",
  "whitelist-add": "whitelist add",
  "whitelist-remove": "whitelist remove",
};

/** Build the literal Minecraft command for an action on a player name. */
function commandFor(action: Action, name: string): string {
  return `${ACTION_VERB[action]} ${name}`.trim();
}

const POLL_MS = 8000;

export function PlayersPanel({ id, canManage }: { id: string; canManage: boolean }) {
  const [data, setData] = useState<PlayersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualAction, setManualAction] = useState<Action>("op");
  const [rawCommand, setRawCommand] = useState("");

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await api<PlayersResponse>(`/api/servers/${id}/players`);
      setData(res);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  /** Send a raw console command, then surface a transient confirmation + refresh. */
  const send = useCallback(async (command: string, busyKey: string) => {
    if (!command.trim()) return;
    setBusy(busyKey);
    setError(null);
    setNote(null);
    try {
      await api(`/api/servers/${id}/command`, { method: "POST", json: { command } });
      setNote(`Sent: ${command}`);
      // Give the server a beat to apply the change, then refresh the live list.
      setTimeout(() => load(false), 600);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }, [id, load]);

  async function runAction(action: Action, name: string) {
    if (
      (action === "ban" || action === "kick") &&
      !(await confirmDialog({ title: `${ACTION_VERB[action]} ${name}?`, danger: true, confirmLabel: ACTION_VERB[action] }))
    )
      return;
    send(commandFor(action, name), `${action}:${name}`);
  }

  function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const name = manualName.trim();
    if (!name) return;
    send(commandFor(manualAction, name), `manual:${manualAction}:${name}`);
    setManualName("");
  }

  function submitRaw(e: React.FormEvent) {
    e.preventDefault();
    const cmd = rawCommand.trim();
    if (!cmd) return;
    send(cmd, `raw:${cmd}`);
    setRawCommand("");
  }

  const players = data?.players;
  const sample = players?.sample ?? [];
  const online = data?.online ?? false;

  return (
    <div className="space-y-5">
      {/* online players card */}
      <div className="glass overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-white/70">
            <Users2 className="h-4 w-4 text-cyan" />
            Players
            {players && (
              <span className="rounded-full border border-white/10 bg-black/30 px-2 py-0.5 text-xs text-white/50">
                {players.online}/{players.max}
              </span>
            )}
          </div>
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
        </div>

        {error && <div className="border-b border-danger/20 bg-danger/10 px-4 py-2 text-sm text-danger">{error}</div>}
        {note && <div className="border-b border-online/20 bg-online/10 px-4 py-2 text-sm text-online">{note}</div>}

        {loading && !data ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          </div>
        ) : !online ? (
          <EmptyState icon={Users2} title="Serveur hors ligne" text="Démarre le serveur pour gérer les joueurs." />
        ) : sample.length === 0 ? (
          <EmptyState icon={Users2} title="Aucun joueur en ligne" text="Personne n'est connecté pour le moment." />
        ) : (
          <div className="divide-y divide-white/5">
            {sample.map((name) => (
              <div key={name} className="group flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-white/5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 bg-black/30 text-xs font-semibold uppercase text-cyan-light">
                    {name.slice(0, 2)}
                  </span>
                  <span className="font-mono text-sm text-white/85">{name}</span>
                </div>
                {canManage && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <QuickButton label="Op" icon={ShieldCheck} busy={busy === `op:${name}`} onClick={() => runAction("op", name)} />
                    <QuickButton label="Kick" icon={LogOut} tone="warn" busy={busy === `kick:${name}`} onClick={() => runAction("kick", name)} />
                    <QuickButton label="Ban" icon={Ban} tone="danger" busy={busy === `ban:${name}`} onClick={() => runAction("ban", name)} />
                    <QuickButton label="Whitelist" icon={ListChecks} busy={busy === `whitelist-add:${name}`} onClick={() => runAction("whitelist-add", name)} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* manual player command card */}
      {canManage && (
        <div className="glass overflow-hidden">
          <button
            onClick={() => setManualOpen((o) => !o)}
            className="flex w-full items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-white/70"
          >
            <span className="flex items-center gap-2"><UserCheck className="h-4 w-4 text-cyan" /> Manual player actions</span>
            {manualOpen ? <ChevronUp className="h-4 w-4 text-white/40" /> : <ChevronDown className="h-4 w-4 text-white/40" />}
          </button>

          {manualOpen && (
            <div className="space-y-4 p-4">
              {/* targeted action on any name (also works for offline players) */}
              <form onSubmit={submitManual} className="flex flex-wrap items-center gap-2">
                <select
                  value={manualAction}
                  onChange={(e) => setManualAction(e.target.value as Action)}
                  className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/85 outline-none focus:border-cyan/50"
                >
                  <option value="op">Op</option>
                  <option value="deop">Deop</option>
                  <option value="kick">Kick</option>
                  <option value="ban">Ban</option>
                  <option value="pardon">Pardon (unban)</option>
                  <option value="whitelist-add">Whitelist add</option>
                  <option value="whitelist-remove">Whitelist remove</option>
                </select>
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Player name…"
                  className="min-w-[10rem] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white/85 outline-none placeholder:text-white/25 focus:border-cyan/50"
                />
                <button
                  type="submit"
                  disabled={!manualName.trim() || !!busy}
                  className="btn-primary flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-40"
                >
                  {busy?.startsWith("manual:") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Run
                </button>
              </form>
              <p className="font-mono text-[11px] text-white/30">
                → {commandFor(manualAction, manualName.trim() || "<player>")}
              </p>

              {/* free-form console command escape hatch */}
              <form onSubmit={submitRaw} className="flex flex-wrap items-center gap-2 border-t border-white/5 pt-4">
                <input
                  value={rawCommand}
                  onChange={(e) => setRawCommand(e.target.value)}
                  placeholder="Raw command, e.g. pardon-ip 1.2.3.4 …"
                  className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white/85 outline-none placeholder:text-white/25 focus:border-cyan/50"
                />
                <button
                  type="submit"
                  disabled={!rawCommand.trim() || !!busy}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-sm disabled:opacity-40"
                >
                  <Send className="h-4 w-4" /> Send
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {!canManage && online && (
        <p className="px-1 text-xs text-white/30">You have read-only access to the player list.</p>
      )}
    </div>
  );
}

function QuickButton({
  label, icon: Icon, onClick, busy, tone,
}: {
  label: string;
  icon: any;
  onClick: () => void;
  busy?: boolean;
  tone?: "warn" | "danger";
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={label}
      className={cn(
        "flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs transition hover:bg-white/10 disabled:opacity-40",
        tone === "warn" && "text-warn hover:border-warn/30",
        tone === "danger" && "text-danger hover:border-danger/30",
        !tone && "text-white/70",
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}
