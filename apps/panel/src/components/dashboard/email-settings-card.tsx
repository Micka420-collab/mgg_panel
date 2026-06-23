"use client";
import { useEffect, useState } from "react";
import { Mail, Loader2, Save, Send, CheckCircle2, AlertTriangle } from "lucide-react";
import { api } from "@/lib/client";

interface Cfg { host: string; port: number; user: string; from: string; secure: boolean; hasPass: boolean; enabled: boolean }

/** Admin: SMTP configuration for transactional emails (crash/security/backup alerts). */
export function EmailSettingsCard() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [pass, setPass] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    api<Cfg>("/api/admin/email").then(setCfg).catch(() => setCfg({ host: "", port: 587, user: "", from: "", secure: false, hasPass: false, enabled: false }));
  }, []);

  if (!cfg) return <div className="glass flex items-center gap-2 p-5 text-sm text-white/40"><Loader2 className="h-4 w-4 animate-spin" /> Email…</div>;

  const set = (k: keyof Cfg, v: any) => setCfg({ ...cfg, [k]: v });

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await api<{ enabled: boolean }>("/api/admin/email", { method: "POST", json: { ...cfg, pass: pass || undefined } });
      setPass("");
      setMsg({ ok: true, text: r.enabled ? "Configuration SMTP enregistrée." : "Email désactivé (hôte vide)." });
      api<Cfg>("/api/admin/email").then(setCfg).catch(() => {});
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setSaving(false); }
  }
  async function test() {
    setTesting(true); setMsg(null);
    try {
      const r = await api<{ sentTo: string }>("/api/admin/email/test", { method: "POST" });
      setMsg({ ok: true, text: `Email de test envoyé à ${r.sentTo}.` });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setTesting(false); }
  }

  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Mail className="h-4 w-4 text-cyan" /> Notifications par email (SMTP)</h3>
        <span className={`text-xs ${cfg.enabled ? "text-online" : "text-white/40"}`}>{cfg.enabled ? "● Activé" : "○ Désactivé"}</span>
      </div>
      <p className="mt-1 text-sm text-white/50">Envoie des emails auto (crash, sécurité, sauvegardes, bilans IA). Laisse l'hôte vide pour désactiver.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><label className="label">Hôte SMTP</label><input className="input" placeholder="smtp.gmail.com" value={cfg.host} onChange={(e) => set("host", e.target.value)} /></div>
        <div><label className="label">Port</label><input className="input" type="number" value={cfg.port} onChange={(e) => set("port", Number(e.target.value))} /></div>
        <div><label className="label">Utilisateur</label><input className="input" placeholder="user@gmail.com" value={cfg.user} onChange={(e) => set("user", e.target.value)} /></div>
        <div><label className="label">Mot de passe {cfg.hasPass && <span className="text-white/30">(défini — laisser vide pour garder)</span>}</label><input className="input" type="password" placeholder={cfg.hasPass ? "••••••••" : ""} value={pass} onChange={(e) => setPass(e.target.value)} /></div>
        <div><label className="label">Expéditeur (From)</label><input className="input" placeholder="MGG <no-reply@mondomaine.fr>" value={cfg.from} onChange={(e) => set("from", e.target.value)} /></div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-white/70"><input type="checkbox" checked={cfg.secure} onChange={(e) => set("secure", e.target.checked)} /> TLS implicite (port 465)</label>
      </div>

      {msg && (
        <div className={`mt-4 flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${msg.ok ? "border-online/30 bg-online/10 text-online" : "border-danger/30 bg-danger/10 text-danger"}`}>
          {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.text}
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer</button>
        <button onClick={test} disabled={testing || !cfg.enabled} className="btn-ghost">{testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer un test</button>
      </div>
    </div>
  );
}
