"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Loader2, Plus, Trash2, Copy, Check, AlertTriangle, Lock } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";
import { relativeTime } from "@/lib/util";
import { WebhooksPanel } from "@/components/dashboard/webhooks-panel";

interface Me {
  id: string;
  username: string;
  email: string;
  role: string;
  totpEnabled: boolean;
}
interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [keys, setKeys] = useState<ApiKey[]>([]);

  const loadMe = () => api<{ user: Me }>("/api/me").then((r) => setMe(r.user));
  const loadKeys = () => api<{ keys: ApiKey[] }>("/api/account/api-keys").then((r) => setKeys(r.keys));
  useEffect(() => {
    loadMe();
    loadKeys();
  }, []);

  if (!me) return <Loader2 className="h-6 w-6 animate-spin text-cyan" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-white">Account</h1>
        <p className="mt-1 text-sm text-white/50">Manage your profile, security and API access.</p>
      </div>

      <div className="glass p-6">
        <h2 className="font-display font-semibold text-white">Profile</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div><label className="label">Username</label><input className="input" value={me.username} readOnly /></div>
          <div><label className="label">Email</label><input className="input" value={me.email} readOnly /></div>
        </div>
      </div>

      <ChangePassword />
      <TwoFactor me={me} onChange={loadMe} />
      <ApiKeys keys={keys} reload={loadKeys} isAdmin={me.role === "ADMIN"} />
      <WebhooksPanel />
    </div>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    setError(null);
    setDone(false);
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/account/password", { method: "POST", json: { currentPassword: current, newPassword: next } });
      setDone(true);
      setCurrent("");
      setNext("");
      setConfirm("");
      setTimeout(() => setDone(false), 4000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass p-6">
      <h2 className="flex items-center gap-2 font-display font-semibold text-white">
        <Lock className="h-4 w-4 text-cyan" /> Password
      </h2>
      <p className="mt-1 text-sm text-white/45">Change your account password. Your other devices will be signed out.</p>

      {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
      {done && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-online/30 bg-online/10 px-3 py-2 text-sm text-online">
          <Check className="h-4 w-4" /> Password updated.
        </div>
      )}

      <div className="mt-4 grid max-w-md gap-3">
        <div>
          <label className="label">Current password</label>
          <input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label">New password</label>
          <input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <button onClick={submit} disabled={busy || !current || !next || !confirm} className="btn-primary w-fit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Update password
        </button>
      </div>
    </div>
  );
}

function TwoFactor({ me, onChange }: { me: Me; onChange: () => void }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [pwd, setPwd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      setSetup(await api("/api/account/2fa/setup", { method: "POST" }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ recoveryCodes: string[] }>("/api/account/2fa/enable", { method: "POST", json: { code } });
      setRecovery(res.recoveryCodes);
      setSetup(null);
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/2fa/disable", { method: "POST", json: { password: pwd } });
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass p-6">
      <h2 className="flex items-center gap-2 font-display font-semibold text-white">
        <ShieldCheck className="h-4 w-4 text-cyan" /> Two-factor authentication
      </h2>
      {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {recovery ? (
        <div className="mt-4">
          <div className="flex items-center gap-2 text-online"><Check className="h-4 w-4" /> 2FA enabled.</div>
          <p className="mt-3 flex items-center gap-2 text-sm text-warn"><AlertTriangle className="h-4 w-4" /> Save these recovery codes — they won&apos;t be shown again.</p>
          <div className="mt-2 grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/30 p-4 font-mono text-sm text-white/80 sm:grid-cols-5">
            {recovery.map((c) => <span key={c}>{c}</span>)}
          </div>
        </div>
      ) : me.totpEnabled ? (
        <div className="mt-4">
          <p className="text-sm text-white/55">2FA is <span className="text-online">active</span> on your account.</p>
          <div className="mt-3 flex max-w-sm items-end gap-2">
            <div className="flex-1"><label className="label">Confirm password to disable</label><input className="input" type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
            <button onClick={disable} disabled={busy} className="btn-danger">Disable</button>
          </div>
        </div>
      ) : setup ? (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={setup.qr} alt="2FA QR" className="h-40 w-40 rounded-xl border border-white/10 bg-white p-1" />
          <div className="flex-1">
            <p className="text-sm text-white/55">Scan with your authenticator, or enter the secret:</p>
            <code className="mt-1 block break-all rounded-lg bg-black/30 px-2 py-1 font-mono text-xs text-cyan-light">{setup.secret}</code>
            <div className="mt-3 flex items-end gap-2">
              <div><label className="label">6-digit code</label><input className="input w-36 text-center font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} maxLength={6} /></div>
              <button onClick={enable} disabled={busy} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enable"}</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <p className="text-sm text-white/55">Add a second factor (TOTP) for stronger account security.</p>
          <button onClick={begin} disabled={busy} className="btn-ghost mt-3">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set up 2FA"}</button>
        </div>
      )}
    </div>
  );
}

function ApiKeys({ keys, reload, isAdmin }: { keys: ApiKey[]; reload: () => void; isAdmin: boolean }) {
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create() {
    if (!name) return;
    setBusy(true);
    try {
      const res = await api<{ key: string }>("/api/account/api-keys", { method: "POST", json: { name, admin: isAdmin } });
      setCreated(res.key);
      setName("");
      reload();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    if (
      !(await confirmDialog({
        title: "Revoke this API key?",
        description: "Any app or launcher using it will immediately stop working.",
        danger: true,
        confirmLabel: "Revoke",
      }))
    )
      return;
    await api(`/api/account/api-keys/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="glass p-6">
      <h2 className="flex items-center gap-2 font-display font-semibold text-white"><KeyRound className="h-4 w-4 text-cyan" /> API keys</h2>
      <p className="mt-1 text-sm text-white/45">Use these as bearer tokens for the launcher / REST API. Treat them like passwords.</p>

      {created && (
        <div className="mt-4 rounded-xl border border-online/30 bg-online/10 p-3">
          <p className="text-xs text-white/60">Copy your key now — it won&apos;t be shown again:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate font-mono text-sm text-online">{created}</code>
            <button onClick={() => { navigator.clipboard.writeText(created); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="text-white/60 hover:text-white">
              {copied ? <Check className="h-4 w-4 text-online" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1"><label className="label">New key name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="My launcher" /></div>
        <button onClick={create} disabled={busy || !name} className="btn-primary">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create</button>
      </div>

      <div className="mt-4 divide-y divide-white/5">
        {keys.map((k) => (
          <div key={k.id} className="flex items-center justify-between py-3">
            <div>
              <div className="text-sm font-medium text-white">{k.name}</div>
              <div className="font-mono text-xs text-white/40">{k.prefix}··· · {k.lastUsedAt ? `used ${relativeTime(k.lastUsedAt)}` : "never used"}</div>
            </div>
            <button onClick={() => revoke(k.id)} className="text-white/30 hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        {keys.length === 0 && <p className="py-6 text-center text-sm text-white/30">No API keys yet.</p>}
      </div>
    </div>
  );
}
