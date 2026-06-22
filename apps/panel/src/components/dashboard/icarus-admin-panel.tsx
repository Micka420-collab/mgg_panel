"use client";
import { useMemo, useState } from "react";
import {
  ShieldCheck, Users, KeyRound, Copy, Check, RefreshCw, Lock, Save, Loader2, Ban, Info, Crown, RotateCw,
} from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";

interface Var { key: string; value: string; }
interface Props {
  id: string;
  variables: Var[];
  stats: any; // live socket stats (players)
  running: boolean;
  canEdit: boolean;
  onSaved: () => void;
}

function randomPassword(len = 18): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => chars[b % chars.length]).join("");
}

export function IcarusAdminPanel({ id, variables, stats, running, canEdit, onSaved }: Props) {
  const v = useMemo(() => {
    const m: Record<string, string> = {};
    for (const x of variables) m[x.key] = x.value;
    return m;
  }, [variables]);

  const [name, setName] = useState(v.SERVER_NAME ?? "");
  const [maxPlayers, setMaxPlayers] = useState(v.SERVER_MAX_PLAYERS ?? "8");
  const [joinPw, setJoinPw] = useState(v.SERVER_PASSWORD ?? "");
  const [adminPw, setAdminPw] = useState(v.SERVER_ADMIN_PASSWORD ?? "");
  const [admins, setAdmins] = useState(v.ICARUS_ADMIN_STEAMIDS ?? "");
  const [revealAdmin, setRevealAdmin] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const players: string[] = stats?.players?.sample ?? [];
  const adminFlags: string[] = stats?.players?.admins ?? [];

  const dirty =
    name !== (v.SERVER_NAME ?? "") || maxPlayers !== (v.SERVER_MAX_PLAYERS ?? "8") ||
    joinPw !== (v.SERVER_PASSWORD ?? "") || adminPw !== (v.SERVER_ADMIN_PASSWORD ?? "") ||
    admins !== (v.ICARUS_ADMIN_STEAMIDS ?? "");

  async function save() {
    setSaving(true);
    try {
      const res = await api<{ restartNeeded?: boolean }>(`/api/servers/${id}`, {
        method: "PATCH",
        json: { variables: { SERVER_NAME: name, SERVER_MAX_PLAYERS: maxPlayers, SERVER_PASSWORD: joinPw, SERVER_ADMIN_PASSWORD: adminPw, ICARUS_ADMIN_STEAMIDS: admins } },
      });
      toast("Réglages Icarus enregistrés.", "success");
      onSaved();
      if (res?.restartNeeded && running) {
        if (await confirmDialog({ title: "Appliquer maintenant ?", description: "Ces réglages s'appliquent au redémarrage du serveur. Redémarrer maintenant ? (sinon au prochain démarrage)", confirmLabel: "Redémarrer et appliquer" })) {
          await api(`/api/servers/${id}/power`, { method: "POST", json: { action: "restart" } }).catch((e: any) => toast(e.message, "error"));
          toast("Serveur en redémarrage…", "success");
        }
      }
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function copyAdmin() {
    await navigator.clipboard.writeText(adminPw);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5">
      {/* roster */}
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Users className="h-4 w-4 text-cyan" /> Joueurs connectés {stats?.players ? `(${stats.players.online}/${stats.players.max})` : ""}</h3>
        {players.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {players.map((p) => {
              const isAdmin = adminFlags.includes(p);
              return (
                <span key={p} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm ${isAdmin ? "bg-warn/15 text-warn" : "bg-white/[0.06] text-white/75"}`}>
                  {isAdmin && <Crown className="h-3.5 w-3.5" />}{p}
                </span>
              );
            })}
          </div>
        ) : (
          <p className="mt-2 text-sm text-white/40">{running ? "Personne connecté." : "Serveur arrêté."}</p>
        )}
      </div>

      {/* admin password = the real "make admin" lever */}
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white"><ShieldCheck className="h-4 w-4 text-cyan" /> Rendre quelqu'un admin</h3>
        <p className="mt-1 text-sm text-white/50">Sur Icarus, l'admin se donne par <b className="text-white/80">mot de passe</b> : partage-le à la personne, elle tape <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-xs text-cyan-light">/AdminLogin {revealAdmin ? adminPw || "<mdp>" : "<mdp>"}</code> en jeu pour devenir admin (kick, ban en jeu, gestion des prospects…).</p>
        <div className="mt-3 flex items-center gap-2">
          <input className="input flex-1 font-mono" type={revealAdmin ? "text" : "password"} value={adminPw} onChange={(e) => setAdminPw(e.target.value)} disabled={!canEdit} />
          <button onClick={() => setRevealAdmin((x) => !x)} className="rounded-lg border border-white/10 p-2.5 text-white/50 hover:text-white" title={revealAdmin ? "Masquer" : "Afficher"}><KeyRound className="h-4 w-4" /></button>
          <button onClick={copyAdmin} className="rounded-lg border border-white/10 p-2.5 text-white/50 hover:text-white" title="Copier">{copied ? <Check className="h-4 w-4 text-online" /> : <Copy className="h-4 w-4" />}</button>
          {canEdit && <button onClick={() => { setAdminPw(randomPassword()); setRevealAdmin(true); }} className="rounded-lg border border-white/10 p-2.5 text-white/50 hover:text-white" title="Générer un nouveau mot de passe"><RefreshCw className="h-4 w-4" /></button>}
        </div>
        <div className="mt-4">
          <label className="label">Admins (SteamID64, séparés par des virgules)</label>
          <input className="input font-mono text-sm" value={admins} onChange={(e) => setAdmins(e.target.value)} disabled={!canEdit} placeholder="76561198000000000, 7656119800000…" />
          <p className="mt-1 text-xs text-white/40">Ces SteamID apparaissent <span className="text-warn">en doré</span> dans la liste des joueurs. (Icarus ne loguant pas les admins, c'est cette liste qui sert d'affichage — l'admin réel reste donné par le mot de passe ci-dessus.)</p>
        </div>
      </div>

      {/* access */}
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Lock className="h-4 w-4 text-cyan" /> Accès au serveur</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div><label className="label">Nom du serveur</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></div>
          <div><label className="label">Joueurs max</label><input className="input" type="number" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} disabled={!canEdit} /></div>
          <div className="sm:col-span-2">
            <label className="label">Mot de passe d'accès (verrouille le serveur — vide = ouvert)</label>
            <input className="input font-mono" value={joinPw} onChange={(e) => setJoinPw(e.target.value)} disabled={!canEdit} placeholder="(ouvert)" />
          </div>
        </div>
      </div>

      {/* ban — honest */}
      <div className="glass border border-warn/20 p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Ban className="h-4 w-4 text-warn" /> Bannir / expulser un joueur</h3>
        <div className="mt-2 flex items-start gap-2 text-sm text-white/60">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
          <div>
            <p>Icarus <b className="text-white/80">n'a pas de RCON</b> : il est impossible de bannir/kicker un joueur précis à distance depuis le panel (le jeu ne fournit aucun canal de commande, et n'a pas de fichier banlist). Les leviers réels :</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-white/55">
              <li><b className="text-white/75">En jeu</b> : un admin connecté (via <code className="font-mono text-cyan-light">/AdminLogin</code>) peut kicker/bannir avec les commandes admin Icarus.</li>
              <li><b className="text-white/75">Verrouiller le serveur</b> : mets un mot de passe d'accès ci-dessus → seuls ceux qui l'ont peuvent rejoindre (puis change-le pour exclure quelqu'un).</li>
              <li><b className="text-white/75">Couper l'accès à tous</b> : redémarrer déconnecte tout le monde (le banni inclus). Utile en dépannage.</li>
            </ul>
          </div>
        </div>
        {canEdit && (
          <button
            onClick={async () => {
              if (await confirmDialog({ title: "Redémarrer le serveur ?", description: "Cela déconnecte TOUS les joueurs (un préavis in-game de 30 s est diffusé s'il y a du monde). Continuer ?", confirmLabel: "Redémarrer" })) {
                await api(`/api/servers/${id}/power`, { method: "POST", json: { action: "restart", ...(stats?.players?.online ? { warnSeconds: 30 } : {}) } }).then(() => toast("Redémarrage demandé.", "success")).catch((e: any) => toast(e.message, "error"));
              }
            }}
            className="btn-ghost mt-3 text-sm"
          >
            <RotateCw className="h-4 w-4" /> Redémarrer (déconnecte tout le monde)
          </button>
        )}
      </div>

      {/* save bar */}
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button onClick={save} disabled={!dirty || saving} className="btn-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer</button>
          <span className="flex items-center gap-1.5 text-xs text-white/30"><RotateCw className="h-3 w-3" /> appliqué au (re)démarrage</span>
        </div>
      ) : (
        <p className="text-xs text-white/30">Tu n'as pas la permission de modifier ces réglages.</p>
      )}
    </div>
  );
}
