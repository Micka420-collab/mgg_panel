"use client";
import { useEffect, useState } from "react";
import { Users2, UserPlus, Trash2, Loader2, Save, ChevronDown, ShieldCheck, Settings2 } from "lucide-react";
import { SCOPES, ALL_SCOPES } from "@mgg/shared";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/util";

interface Subuser {
  id: string;
  userId: string;
  username: string;
  email: string;
  scopes: string[];
}

const GROUP_LABELS: Record<string, string> = {
  control: "Power & console",
  file: "Files",
  backup: "Backups",
  allocation: "Network",
  startup: "Startup",
  settings: "Settings",
  schedule: "Schedules",
  subuser: "Sub-users",
  players: "Players",
};

const GROUPED = Object.entries(SCOPES).reduce<Record<string, { key: string; label: string }[]>>((acc, [key, label]) => {
  const g = key.split(".")[0]!;
  (acc[g] ||= []).push({ key, label });
  return acc;
}, {});

const ALL = [...ALL_SCOPES] as string[];
const isFullAccess = (scopes: string[]) => ALL.every((s) => scopes.includes(s));

function ScopePicker({ value, onChange }: { value: Set<string>; onChange: (s: Set<string>) => void }) {
  const toggle = (k: string) => {
    const next = new Set(value);
    next.has(k) ? next.delete(k) : next.add(k);
    onChange(next);
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(GROUPED).map(([group, scopes]) => (
        <div key={group}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/40">{GROUP_LABELS[group] ?? group}</div>
          <div className="space-y-1.5">
            {scopes.map((s) => (
              <label key={s.key} className="flex cursor-pointer items-start gap-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  checked={value.has(s.key)}
                  onChange={() => toggle(s.key)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/30 accent-cyan"
                />
                <span>{s.label}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SubusersPanel({ id }: { id: string }) {
  const { t } = useT();
  const [subs, setSubs] = useState<Subuser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [newScopes, setNewScopes] = useState<Set<string>>(new Set(["control.console", "control.start", "control.stop"]));
  const [editing, setEditing] = useState<string | null>(null);
  const [editScopes, setEditScopes] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<null | "share" | "custom" | "edit">(null);

  const load = () =>
    api<{ subusers: Subuser[] }>(`/api/servers/${id}/subusers`)
      .then((r) => setSubs(r.subusers))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  /** Send an invite with the given scopes (POST upserts by email). */
  async function invite(scopes: string[], kind: "share" | "custom") {
    if (!email) return;
    setBusy(kind);
    setError(null);
    try {
      await api(`/api/servers/${id}/subusers`, { method: "POST", json: { email, scopes } });
      toast(t("share.shared", { email }), "success");
      setEmail("");
      setAdvanced(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(uid: string) {
    setBusy("edit");
    try {
      await api(`/api/servers/${id}/subusers/${uid}`, { method: "PATCH", json: { scopes: [...editScopes] } });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(uid: string) {
    if (
      !(await confirmDialog({
        title: t("share.removeTitle"),
        description: t("share.removeDesc"),
        danger: true,
        confirmLabel: t("share.remove"),
      }))
    )
      return;
    await api(`/api/servers/${id}/subusers/${uid}`, { method: "DELETE" }).catch((e) => setError(e.message));
    load();
  }

  return (
    <div className="space-y-5">
      {/* Quick share — one click, full access */}
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white">
          <UserPlus className="h-4 w-4 text-cyan" /> {t("share.title")}
        </h3>
        <p className="mt-1 text-sm text-white/45">{t("share.subtitle")}</p>

        {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <label className="label">{t("share.emailLabel")}</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("share.emailPlaceholder")}
            />
          </div>
          <button onClick={() => invite(ALL, "share")} disabled={!!busy || !email} className="btn-primary">
            {busy === "share" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} {t("share.shareBtn")}
          </button>
        </div>

        <button
          onClick={() => setAdvanced((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 text-xs text-white/45 transition hover:text-white"
        >
          <Settings2 className="h-3.5 w-3.5" /> {t("share.advanced")}
          <ChevronDown className={cn("h-3.5 w-3.5 transition", advanced && "rotate-180")} />
        </button>

        {advanced && (
          <div className="mt-3 space-y-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="label">{t("share.customPermissions")}</div>
            <ScopePicker value={newScopes} onChange={setNewScopes} />
            <button onClick={() => invite([...newScopes], "custom")} disabled={!!busy || !email} className="btn-ghost">
              {busy === "custom" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} {t("share.add")}
            </button>
          </div>
        )}
      </div>

      {/* People with access */}
      <div>
        <div className="mb-2 flex items-center gap-2 px-1 text-sm text-white/50">
          <Users2 className="h-4 w-4 text-cyan" /> {t("share.members")}
        </div>
        {loading ? (
          <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-cyan" /></div>
        ) : subs.length === 0 ? (
          <div className="glass px-4 py-10 text-center text-sm text-white/40">{t("share.noMembers")}</div>
        ) : (
          <div className="space-y-3">
            {subs.map((s) => {
              const full = isFullAccess(s.scopes);
              return (
                <div key={s.id} className="glass p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 place-items-center rounded-full bg-cyan-violet text-sm font-semibold text-white">{s.username.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="font-medium text-white">{s.username}</div>
                        <div className="text-xs text-white/40">
                          {s.email} · {full ? t("share.fullAccess") : t("share.permissionsN", { count: s.scopes.length })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setEditing(editing === s.userId ? null : s.userId); setEditScopes(new Set(s.scopes)); }}
                        className="btn-ghost px-2.5 py-1.5 text-xs"
                      >
                        {t("share.edit")} <ChevronDown className={cn("h-3.5 w-3.5 transition", editing === s.userId && "rotate-180")} />
                      </button>
                      <button onClick={() => remove(s.userId)} className="text-white/30 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  {editing === s.userId && (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <ScopePicker value={editScopes} onChange={setEditScopes} />
                      <button onClick={() => saveEdit(s.userId)} disabled={!!busy} className="btn-primary mt-4 px-3 py-1.5 text-xs">
                        <Save className="h-3.5 w-3.5" /> {t("share.savePerms")}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
