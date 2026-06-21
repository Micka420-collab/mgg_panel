"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, Trash2 } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";
import { UpgradeCard } from "./upgrade-card";
import { CloneCard } from "./clone-card";
import { PublishBlueprintCard } from "./publish-blueprint-card";

interface Var {
  key: string;
  name: string;
  description: string;
  type: string;
  options?: { value: string; label: string }[];
  group: string;
  editable: boolean;
  value: string;
}

export function SettingsPanel({
  id,
  detail,
  onSaved,
  canRename,
  canStartup,
}: {
  id: string;
  detail: any;
  onSaved: () => void;
  canRename: boolean;
  canStartup: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(detail.server.name as string);
  const [description, setDescription] = useState((detail.server.description as string) || "");
  const [vars, setVars] = useState<Record<string, string>>(
    Object.fromEntries((detail.variables as Var[]).map((v) => [v.key, v.value])),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return (detail.variables as Var[])
      .filter((v) => v.editable)
      .reduce<Record<string, Var[]>>((acc, v) => {
        (acc[v.group] ||= []).push(v);
        return acc;
      }, {});
  }, [detail.variables]);

  async function save() {
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api<{ restartNeeded?: boolean }>(`/api/servers/${id}`, {
        method: "PATCH",
        json: { ...(canRename ? { name, description } : {}), ...(canStartup ? { variables: vars } : {}) },
      });
      setMsg("Réglages enregistrés.");
      onSaved();
      // Les changements de spec (variables/comportement) n'agissent qu'après reconstruction
      // du conteneur → on propose de redémarrer maintenant pour appliquer immédiatement.
      if (res?.restartNeeded) {
        if (
          await confirmDialog({
            title: "Appliquer maintenant ?",
            description:
              "Ces réglages nécessitent un redémarrage du serveur pour prendre effet. Redémarrer maintenant ? (sinon ils s'appliqueront au prochain démarrage)",
            confirmLabel: "Redémarrer et appliquer",
          })
        ) {
          await api(`/api/servers/${id}/power`, { method: "POST", json: { action: "restart" } });
          toast("Serveur en redémarrage — les changements s'appliquent.", "ok");
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    if (
      !(await confirmDialog({
        title: "Delete this server?",
        description: `This permanently deletes "${detail.server.name}" and ALL its data — world, files and backups. This cannot be undone.`,
        danger: true,
        confirmLabel: "Delete server",
      }))
    )
      return;
    try {
      await api(`/api/servers/${id}`, { method: "DELETE" });
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message);
    }
  }

  return (
    <div className="space-y-5">
      {error && <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {msg && <div className="rounded-xl border border-online/30 bg-online/10 px-3 py-2 text-sm text-online">{msg}</div>}

      {canRename && (
        <div className="glass p-5">
          <h3 className="font-display font-semibold text-white">General</h3>
          <div className="mt-4 max-w-md space-y-4">
            <div>
              <label className="label">Server name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-[72px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
                placeholder="Description du serveur (optionnel)"
              />
            </div>
          </div>
        </div>
      )}

      {detail.isOwner && <BehaviourCard id={id} server={detail.server} />}

      {canStartup &&
        Object.entries(grouped).map(([group, list]) => (
          <div key={group} className="glass p-5">
            <h3 className="font-display font-semibold text-white">{group}</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {list.map((v) => (
                <div key={v.key}>
                  <label className="label" title={v.description}>{v.name}</label>
                  {v.type === "enum" && v.options ? (
                    <select className="input" value={vars[v.key] ?? ""} onChange={(e) => setVars((s) => ({ ...s, [v.key]: e.target.value }))}>
                      {v.options.map((o) => <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>)}
                    </select>
                  ) : v.type === "boolean" ? (
                    <select className="input" value={vars[v.key] ?? ""} onChange={(e) => setVars((s) => ({ ...s, [v.key]: e.target.value }))}>
                      <option value="true" className="bg-surface">Enabled</option>
                      <option value="false" className="bg-surface">Disabled</option>
                      <option value="TRUE" className="bg-surface">TRUE</option>
                      <option value="FALSE" className="bg-surface">FALSE</option>
                    </select>
                  ) : (
                    <input
                      className="input"
                      type={v.type === "number" ? "number" : "text"}
                      value={vars[v.key] ?? ""}
                      onChange={(e) => setVars((s) => ({ ...s, [v.key]: e.target.value }))}
                    />
                  )}
                  <p className="mt-1 text-xs text-white/30">{v.description}</p>
                </div>
              ))}
            </div>
          </div>
        ))}

      {(canRename || canStartup) && (
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
        </button>
      )}

      {detail.isOwner && <UpgradeCard id={id} canUpgrade={canStartup} />}
      {detail.isOwner && <CloneCard id={id} />}
      {detail.isOwner && <PublishBlueprintCard id={id} server={detail.server} />}

      {detail.isOwner && (
        <div className="rounded-2xl border border-danger/30 bg-danger/5 p-5">
          <h3 className="font-display font-semibold text-danger">Danger zone</h3>
          <p className="mt-1 text-sm text-white/50">Deleting a server destroys its container and all world data permanently.</p>
          <button onClick={destroy} className="btn-danger mt-4">
            <Trash2 className="h-4 w-4" /> Delete this server
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative h-6 w-11 shrink-0 rounded-full border border-white/15 bg-white/5 transition" aria-pressed={on}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${on ? "left-6 bg-cyan-violet" : "left-0.5 bg-white/40"}`} />
    </button>
  );
}

function BehaviourCard({ id, server }: { id: string; server: { autoStop: boolean; autoRestart: boolean; idleTimeout: number } }) {
  const [autoStop, setAutoStop] = useState(server.autoStop);
  const [autoRestart, setAutoRestart] = useState(server.autoRestart);
  const [idle, setIdle] = useState(server.idleTimeout);
  const [saving, setSaving] = useState(false);

  async function patch(data: Record<string, unknown>) {
    setSaving(true);
    try {
      await api(`/api/servers/${id}`, { method: "PATCH", json: data });
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="glass p-5">
      <h3 className="font-display font-semibold text-white">Behaviour {saving && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-cyan" />}</h3>
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white/85">Sleep when empty (wake-on-join)</div>
            <div className="text-xs text-white/40">Stops the server when no one is online and wakes it on the next join.</div>
          </div>
          <Toggle on={autoStop} onClick={() => { const v = !autoStop; setAutoStop(v); patch({ autoStop: v }); }} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white/85">Auto-restart on crash</div>
            <div className="text-xs text-white/40">The monitor restarts the server automatically if it errors out.</div>
          </div>
          <Toggle on={autoRestart} onClick={() => { const v = !autoRestart; setAutoRestart(v); patch({ autoRestart: v }); }} />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white/85">Idle timeout</div>
            <div className="text-xs text-white/40">Minutes empty before sleeping.</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1440}
              value={idle === 0 ? "" : String(Math.round(idle / 60))}
              onChange={(e) => { const v = e.target.value; setIdle(v === "" ? 0 : Math.max(1, Number(v)) * 60); }}
              onBlur={() => { const m = Math.min(1440, Math.max(1, Math.round(idle / 60) || 1)); setIdle(m * 60); patch({ idleTimeout: m * 60 }); }}
              className="input w-24 text-center"
            />
            <span className="text-sm text-white/40">min</span>
          </div>
        </div>
      </div>
    </div>
  );
}
