"use client";
import { useEffect, useState } from "react";
import { Webhook, Loader2, Plus, Trash2, Copy, Check, AlertTriangle, CircleDot } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog } from "@/components/ui/confirm";
import { relativeTime } from "@/lib/util";

/** Keep in sync with WEBHOOK_EVENTS in the route handler. */
const EVENTS = [
  { id: "server.started", label: "Server started" },
  { id: "server.stopped", label: "Server stopped" },
  { id: "server.restarted", label: "Server restarted" },
  { id: "server.errored", label: "Server crashed" },
  { id: "backup.created", label: "Backup created" },
] as const;

interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  serverId: string | null;
  active: boolean;
  hasSecret: boolean;
  createdAt: string;
}

export function WebhooksPanel() {
  const [hooks, setHooks] = useState<WebhookRow[] | null>(null);
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(["server.errored"]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    api<{ webhooks: WebhookRow[] }>("/api/account/webhooks").then((r) => setHooks(r.webhooks));

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]));
  }

  async function create() {
    if (!url || selected.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ secret: string }>("/api/account/webhooks", {
        method: "POST",
        json: { url, events: selected },
      });
      setSecret(res.secret);
      setUrl("");
      setSelected(["server.errored"]);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (
      !(await confirmDialog({
        title: "Delete this webhook?",
        description: "Events will stop being delivered to it.",
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    try {
      await api(`/api/account/webhooks/${id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="glass p-6">
      <h2 className="flex items-center gap-2 font-display font-semibold text-white">
        <Webhook className="h-4 w-4 text-cyan" /> Webhooks
      </h2>
      <p className="mt-1 text-sm text-white/45">
        POST a JSON payload to an external URL when server events fire. Each delivery is signed with{" "}
        <code className="font-mono text-white/60">X-MGG-Signature</code> (HMAC-SHA256).
      </p>

      {error && (
        <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {secret && (
        <div className="mt-4 rounded-xl border border-online/30 bg-online/10 p-3">
          <p className="flex items-center gap-2 text-xs text-warn">
            <AlertTriangle className="h-4 w-4" /> Copy your signing secret now — it won&apos;t be shown again:
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-sm text-online">{secret}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(secret);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="text-white/60 hover:text-white"
            >
              {copied ? <Check className="h-4 w-4 text-online" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* create form */}
      <div className="mt-4 space-y-3">
        <div>
          <label className="label">Endpoint URL</label>
          <input
            className="input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/hooks/mgg"
          />
        </div>
        <div>
          <label className="label">Events</label>
          <div className="mt-1 flex flex-wrap gap-2">
            {EVENTS.map((ev) => {
              const on = selected.includes(ev.id);
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => toggle(ev.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    on
                      ? "border-cyan/50 bg-cyan/15 text-cyan-light"
                      : "border-white/10 bg-white/[0.03] text-white/50 hover:text-white"
                  }`}
                >
                  {ev.label}
                </button>
              );
            })}
          </div>
        </div>
        <button onClick={create} disabled={busy || !url || selected.length === 0} className="btn-primary">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add webhook
        </button>
      </div>

      {/* list */}
      <div className="mt-5 divide-y divide-white/5">
        {hooks === null ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-cyan" />
          </div>
        ) : (
          <>
            {hooks.map((h) => (
              <div key={h.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CircleDot className={`h-3 w-3 shrink-0 ${h.active ? "text-online" : "text-white/25"}`} />
                    <span className="truncate font-mono text-sm text-white/85">{h.url}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {h.events.map((e) => (
                      <span key={e} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/45">
                        {e}
                      </span>
                    ))}
                    <span className="text-[10px] text-white/30">· added {relativeTime(h.createdAt)}</span>
                  </div>
                </div>
                <button onClick={() => remove(h.id)} className="shrink-0 text-white/30 hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {hooks.length === 0 && <p className="py-6 text-center text-sm text-white/30">No webhooks yet.</p>}
          </>
        )}
      </div>
    </div>
  );
}
