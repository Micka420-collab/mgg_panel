"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Users, Search, ShieldCheck, Crown, Ban, Trash2, Server as ServerIcon, KeyRound, Loader2,
  ArrowLeft, ChevronDown, CircleCheck, ShieldQuestion,
} from "lucide-react";
import { SCOPES, SCOPE_GROUP_LABELS } from "@mgg/shared";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";
import { relativeTime } from "@/lib/util";

interface Row {
  id: string;
  username: string;
  email: string;
  role: "USER" | "ADMIN";
  suspended: boolean;
  totpEnabled: boolean;
  credits: number;
  createdAt: string;
  servers: number;
  subuserOf: number;
}

const GROUPED = Object.entries(SCOPES).reduce<Record<string, { key: string; label: string }[]>>((acc, [key, label]) => {
  (acc[key.split(".")[0]!] ||= []).push({ key, label });
  return acc;
}, {});

export default function AdminUsersPage() {
  const [users, setUsers] = useState<Row[]>([]);
  const [me, setMe] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "admin" | "suspended">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [showPerms, setShowPerms] = useState(false);

  const load = () =>
    api<{ users: Row[]; me: string }>("/api/admin/users")
      .then((r) => { setUsers(r.users); setMe(r.me); })
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);

  const shown = useMemo(() => {
    let list = users;
    if (filter === "admin") list = list.filter((u) => u.role === "ADMIN");
    if (filter === "suspended") list = list.filter((u) => u.suspended);
    const s = q.trim().toLowerCase();
    if (s) list = list.filter((u) => u.username.toLowerCase().includes(s) || u.email.toLowerCase().includes(s));
    return list;
  }, [users, filter, q]);

  const stats = useMemo(() => ({
    total: users.length,
    admins: users.filter((u) => u.role === "ADMIN").length,
    suspended: users.filter((u) => u.suspended).length,
  }), [users]);

  async function setRole(u: Row) {
    const toAdmin = u.role === "USER";
    if (!(await confirmDialog({
      title: toAdmin ? `Promouvoir ${u.username} administrateur ?` : `Rétrograder ${u.username} en utilisateur ?`,
      description: toAdmin ? "Cette personne aura un accès TOTAL à la plateforme (tous les serveurs, tous les comptes)." : "Cette personne perdra les droits d'administration.",
      danger: toAdmin,
      confirmLabel: toAdmin ? "Promouvoir admin" : "Rétrograder",
    }))) return;
    setBusy(u.id);
    try { await api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { role: toAdmin ? "ADMIN" : "USER" } }); toast("Rôle mis à jour.", "success"); await load(); }
    catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  }
  async function setSuspended(u: Row) {
    const sus = !u.suspended;
    if (!(await confirmDialog({
      title: sus ? `Suspendre ${u.username} ?` : `Réactiver ${u.username} ?`,
      description: sus ? "Le compte ne pourra plus se connecter (ses serveurs continuent de tourner)." : "Le compte pourra de nouveau se connecter.",
      danger: sus,
      confirmLabel: sus ? "Suspendre" : "Réactiver",
    }))) return;
    setBusy(u.id);
    try { await api(`/api/admin/users/${u.id}`, { method: "PATCH", json: { suspended: sus } }); toast(sus ? "Compte suspendu." : "Compte réactivé.", "success"); await load(); }
    catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  }
  async function del(u: Row) {
    if (!(await confirmDialog({
      title: `Supprimer le compte ${u.username} ?`,
      description: "Action irréversible. Le compte et ses accès sont supprimés définitivement.",
      danger: true,
      confirmLabel: "Supprimer définitivement",
    }))) return;
    setBusy(u.id);
    try { await api(`/api/admin/users/${u.id}`, { method: "DELETE" }); toast("Compte supprimé.", "success"); await load(); }
    catch (e: any) { toast(e.message, "error"); } finally { setBusy(null); }
  }

  return (
    <div>
      <Link href="/dashboard/admin" className="inline-flex items-center gap-1 text-sm text-white/50 transition hover:text-white"><ArrowLeft className="h-4 w-4" /> Admin</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-white"><Users className="h-6 w-6 text-cyan" /> Utilisateurs & permissions</h1>
          <p className="mt-1 text-sm text-white/50">Gère les comptes, les rôles et les accès de la plateforme.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input className="input pl-9" placeholder="Rechercher un compte…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: "Comptes", value: stats.total, icon: Users },
          { label: "Admins", value: stats.admins, icon: Crown },
          { label: "Suspendus", value: stats.suspended, icon: Ban },
        ].map((s) => (
          <div key={s.label} className="glass flex items-center gap-3 p-4">
            <s.icon className="h-5 w-5 text-cyan" />
            <div><div className="font-display text-2xl font-bold text-white">{s.value}</div><div className="text-xs text-white/40">{s.label}</div></div>
          </div>
        ))}
      </div>

      <div className="mt-5 inline-flex rounded-xl border border-white/10 bg-white/[0.03] p-1 text-sm">
        {([["all", "Tous"], ["admin", "Admins"], ["suspended", "Suspendus"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1.5 transition ${filter === k ? "bg-cyan/15 text-white" : "text-white/50 hover:text-white"}`}>{l}</button>
        ))}
      </div>

      <div className="glass mt-4 overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>
        ) : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-12 text-center text-white/40"><Users className="h-8 w-8" /> Aucun compte.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {shown.map((u) => {
              const self = u.id === me;
              return (
                <div key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-cyan-violet text-sm font-semibold text-white">{u.username.slice(0, 2).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-white">{u.username}</span>
                      {self && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">toi</span>}
                      {u.role === "ADMIN" && <span className="inline-flex items-center gap-1 rounded bg-cyan/15 px-1.5 py-0.5 text-[10px] font-medium text-cyan"><Crown className="h-2.5 w-2.5" /> Admin</span>}
                      {u.suspended && <span className="inline-flex items-center gap-1 rounded bg-danger/15 px-1.5 py-0.5 text-[10px] font-medium text-danger"><Ban className="h-2.5 w-2.5" /> Suspendu</span>}
                      {u.totpEnabled && <span title="2FA activée" className="inline-flex items-center gap-1 rounded bg-online/15 px-1.5 py-0.5 text-[10px] font-medium text-online"><ShieldCheck className="h-2.5 w-2.5" /> 2FA</span>}
                    </div>
                    <div className="truncate text-xs text-white/40">{u.email}</div>
                  </div>
                  <div className="hidden items-center gap-4 text-xs text-white/45 sm:flex">
                    <span className="inline-flex items-center gap-1" title="Serveurs possédés"><ServerIcon className="h-3.5 w-3.5" /> {u.servers}</span>
                    <span className="inline-flex items-center gap-1" title="Accès en sous-utilisateur"><KeyRound className="h-3.5 w-3.5" /> {u.subuserOf}</span>
                    <span className="text-white/30">{relativeTime(u.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setRole(u)} disabled={self || busy === u.id} title={u.role === "ADMIN" ? "Rétrograder" : "Promouvoir admin"} className="rounded-lg p-2 text-white/40 transition hover:bg-white/10 hover:text-cyan disabled:opacity-30">
                      {busy === u.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crown className="h-4 w-4" />}
                    </button>
                    <button onClick={() => setSuspended(u)} disabled={self || busy === u.id} title={u.suspended ? "Réactiver" : "Suspendre"} className="rounded-lg p-2 text-white/40 transition hover:bg-white/10 hover:text-warn disabled:opacity-30">
                      {u.suspended ? <CircleCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                    </button>
                    <button onClick={() => del(u)} disabled={self || busy === u.id} title="Supprimer" className="rounded-lg p-2 text-white/40 transition hover:bg-white/10 hover:text-danger disabled:opacity-30">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* permissions reference */}
      <div className="glass mt-6 overflow-hidden">
        <button onClick={() => setShowPerms((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
          <span className="flex items-center gap-2 font-medium text-white"><ShieldQuestion className="h-4 w-4 text-cyan" /> Référence des permissions (sous-utilisateurs)</span>
          <ChevronDown className={`h-4 w-4 text-white/40 transition ${showPerms ? "rotate-180" : ""}`} />
        </button>
        {showPerms && (
          <div className="grid gap-5 border-t border-white/10 p-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(GROUPED).map(([g, list]) => (
              <div key={g}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-cyan">{SCOPE_GROUP_LABELS[g] ?? g}</div>
                <ul className="space-y-1 text-sm text-white/55">
                  {list.map((s) => <li key={s.key}>{s.label}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="border-t border-white/10 px-4 py-2.5 text-xs text-white/35">Ces permissions se donnent par serveur dans l'onglet <b className="text-white/55">Sous-utilisateurs</b> de chaque serveur (avec des presets de rôles).</p>
      </div>
    </div>
  );
}
