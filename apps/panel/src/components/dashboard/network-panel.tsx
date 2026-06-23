"use client";
import { useEffect, useState } from "react";
import {
  Link2,
  Copy,
  Check,
  Loader2,
  Globe,
  X,
  CheckCircle2,
  ArrowRightLeft,
  Share2,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";
import { cn } from "@/lib/util";
import { CrossplayCard } from "./crossplay-card";

interface Alloc {
  id: string;
  ip: string;
  port: number;
  protocol: string;
  role: string;
  primary: boolean;
}

export function NetworkPanel({ detail, isOwner, id, onChanged }: { detail: any; isOwner: boolean; id: string; onChanged?: () => void }) {
  const allocations: Alloc[] = detail.allocations ?? [];
  const primary = allocations.find((a) => a.primary) ?? allocations[0];
  const [wakeUrl, setWakeUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [newPort, setNewPort] = useState("");
  const [savingPort, setSavingPort] = useState(false);
  const [portError, setPortError] = useState<string | null>(null);
  const [portMsg, setPortMsg] = useState<string | null>(null);

  async function changePort() {
    const p = Number(newPort);
    if (!Number.isInteger(p) || p < 1024 || p > 65535) {
      setPortError("Port must be a number between 1024 and 65535.");
      return;
    }
    setSavingPort(true);
    setPortError(null);
    setPortMsg(null);
    try {
      await api(`/api/servers/${id}/allocation`, { method: "PATCH", json: { port: p } });
      setPortMsg(`Game port changed to ${p}. Start the server to apply it.`);
      setNewPort("");
      onChanged?.();
    } catch (e: any) {
      setPortError(e.message);
    } finally {
      setSavingPort(false);
    }
  }

  async function makeLink() {
    setBusy(true);
    try {
      const res = await api<{ url: string }>(`/api/servers/${id}/wake-link`, { method: "POST" });
      setWakeUrl(res.url);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5">
      <div className="glass p-5">
        <h3 className="font-display font-semibold text-white">Allocations</h3>
        <p className="mt-1 text-sm text-white/45">Ports assigned to this server. The primary address is what players connect to.</p>
        <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-left text-xs uppercase tracking-wide text-white/40">
              <tr>
                <th className="px-4 py-2.5">Role</th>
                <th className="px-4 py-2.5">Address</th>
                <th className="px-4 py-2.5">Protocol</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {allocations.map((a) => (
                <tr key={a.id} className="border-t border-white/5">
                  <td className="px-4 py-2.5 text-white/80">
                    {a.role} {a.primary && <span className="ml-1 rounded bg-cyan/15 px-1.5 py-0.5 text-[10px] text-cyan-light">primary</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-cyan-light">{a.ip}:{a.port}</td>
                  <td className="px-4 py-2.5 text-white/50">{String(a.protocol).toLowerCase()}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => copy(`${a.ip}:${a.port}`)} className="text-white/30 hover:text-white"><Copy className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isOwner && primary && (
          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <ArrowRightLeft className="h-4 w-4 text-cyan" /> Change game port
            </div>
            <p className="mt-1 text-xs text-white/45">
              The port players connect to (currently <span className="font-mono text-white/70">{primary.port}</span>).
              Changing it rebuilds the server — it stops, so start it again afterwards.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={1024}
                max={65535}
                value={newPort}
                onChange={(e) => setNewPort(e.target.value)}
                placeholder={String(primary.port)}
                className="input w-32"
              />
              <button onClick={changePort} disabled={savingPort || !newPort} className="btn-primary">
                {savingPort ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />} Change port
              </button>
            </div>
            {portError && <p className="mt-2 text-xs text-danger">{portError}</p>}
            {portMsg && <p className="mt-2 text-xs text-online">{portMsg}</p>}
          </div>
        )}
      </div>

      <DomainCard id={id} isOwner={isOwner} />
      <CustomDomainsCard id={id} isOwner={isOwner} />
      {detail?.server?.game === "minecraft" && <CrossplayCard id={id} canStartup={isOwner} />}
      <SftpCard host={detail?.node?.publicIp ?? "your-node"} serverId={id} />

      {isOwner && (
        <div className="glass p-5">
          <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Link2 className="h-4 w-4 text-cyan" /> Shareable wake link</h3>
          <p className="mt-1 text-sm text-white/45">
            A no-login link anyone can click to <span className="text-white/70">start</span> the server. It can only start — never read files or console.
          </p>
          {wakeUrl ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <span className="flex-1 truncate font-mono text-sm text-cyan-light">{wakeUrl}</span>
              <button onClick={() => copy(wakeUrl)} className="text-white/50 hover:text-white">
                {copied ? <Check className="h-4 w-4 text-online" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <button onClick={makeLink} disabled={busy} className="btn-ghost mt-4">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Generate wake link
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface DomainState {
  configured: boolean;
  base: string;
  current: string | null;
  currentFqdn: string | null;
}

function DomainCard({ id, isOwner }: { id: string; isOwner: boolean }) {
  const [state, setState] = useState<DomainState | null>(null);
  const [sub, setSub] = useState("");
  const [check, setCheck] = useState<{ available: boolean; error?: string; fqdn?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () => api<DomainState>(`/api/servers/${id}/domain`).then(setState).catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!sub) {
      setCheck(null);
      return;
    }
    const t = setTimeout(() => {
      api(`/api/servers/${id}/domain?check=${encodeURIComponent(sub)}`).then(setCheck).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [sub, id]);

  if (!state) return null;
  if (!state.configured) {
    return (
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Globe className="h-4 w-4 text-cyan" /> Free domain</h3>
        <p className="mt-1 text-sm text-white/45">
          Free subdomains aren&apos;t enabled on this platform yet. The admin can turn them on by setting{" "}
          <code className="text-white/60">DOMAIN_BASE</code> + a DNS provider.
        </p>
      </div>
    );
  }

  async function claim() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/servers/${id}/domain`, { method: "POST", json: { subdomain: sub } });
      setSub("");
      setCheck(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function release() {
    if (
      !(await confirmDialog({
        title: "Release this domain?",
        description: "Players will need to reconnect using the raw IP address again.",
        danger: true,
        confirmLabel: "Release",
      }))
    )
      return;
    setBusy(true);
    try {
      await api(`/api/servers/${id}/domain`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="glass p-5">
      <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Globe className="h-4 w-4 text-cyan" /> Free domain</h3>
      <p className="mt-1 text-sm text-white/45">
        Claim a memorable address under <code className="text-white/70">.{state.base}</code>. We set up an A + SRV record
        so players just type the name — no port needed.
      </p>

      {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {state.current ? (
        <>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-online/30 bg-online/10 px-3 py-2">
            <CheckCircle2 className="h-4 w-4 text-online" />
            <span className="flex-1 truncate font-mono text-sm text-online">{state.currentFqdn}</span>
            <button onClick={() => copy(state.currentFqdn!)} className="text-white/50 hover:text-white">
              {copied ? <Check className="h-4 w-4 text-online" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          {isOwner && (
            <button onClick={release} disabled={busy} className="btn-ghost text-danger">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Release
            </button>
          )}
        </div>
        <a
          href={`/s/${state.current}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1.5 text-xs text-cyan transition hover:text-cyan-light"
        >
          <Share2 className="h-3.5 w-3.5" /> Open shareable public page · <span className="font-mono">/s/{state.current}</span>
        </a>
        </>
      ) : isOwner ? (
        <div className="mt-4">
          <div className="flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-black/25 focus-within:border-cyan/50">
            <input
              value={sub}
              onChange={(e) => setSub(e.target.value.toLowerCase())}
              placeholder="myserver"
              className="flex-1 bg-transparent px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-white/25"
            />
            <span className="flex items-center bg-white/[0.04] px-3 font-mono text-sm text-white/50">.{state.base}</span>
          </div>
          {check && sub && (
            <p className={cn("mt-2 text-xs", check.available ? "text-online" : "text-danger")}>
              {check.available ? `✓ ${check.fqdn} is available` : `✗ ${check.error}`}
            </p>
          )}
          <button onClick={claim} disabled={busy || !check?.available} className="btn-primary mt-3">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Claim domain
          </button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-white/40">No custom domain set.</p>
      )}
    </div>
  );
}

interface CustomDomain {
  id: string;
  hostname: string;
  targetPort: number;
  status: string;
  lastError: string | null;
  verifiedAt: string | null;
}
interface DomainsState {
  configured: boolean;
  target: string;
  ports: { port: number; role: string; primary: boolean }[];
  domains: CustomDomain[];
}

function statusBadge(s: string) {
  if (s === "active") return <span className="rounded bg-online/15 px-2 py-0.5 text-[11px] text-online">Live · HTTPS</span>;
  if (s === "failed") return <span className="rounded bg-danger/15 px-2 py-0.5 text-[11px] text-danger">Failed</span>;
  return <span className="rounded bg-warn/15 px-2 py-0.5 text-[11px] text-warn">Pending DNS</span>;
}

/**
 * Bring-your-own-domain: point a domain from any registrar at this server and
 * let the platform's integrated reverse proxy terminate HTTPS automatically.
 */
function CustomDomainsCard({ id, isOwner }: { id: string; isOwner: boolean }) {
  const [state, setState] = useState<DomainsState | null>(null);
  const [host, setHost] = useState("");
  const [port, setPort] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null); // domainId being verified/removed
  const [copied, setCopied] = useState<string | null>(null);

  const load = () =>
    api<DomainsState>(`/api/servers/${id}/custom-domains`)
      .then((s) => {
        setState(s);
        setPort((p) => (p === "" && s.ports[0] ? s.ports[0].port : p));
      })
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!state) return null;

  if (!state.configured) {
    return (
      <div className="glass p-5">
        <h3 className="flex items-center gap-2 font-display font-semibold text-white">
          <Globe className="h-4 w-4 text-cyan" /> Custom domain
        </h3>
        <p className="mt-1 text-sm text-white/45">
          The integrated reverse proxy isn&apos;t enabled on this platform yet. The admin can turn it on by setting{" "}
          <code className="text-white/60">CADDY_ADMIN_URL</code> (the bundled Caddy proxy).
        </p>
      </div>
    );
  }

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/servers/${id}/custom-domains`, { method: "POST", json: { hostname: host, targetPort: port } });
      setHost("");
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verify(d: CustomDomain) {
    setWorking(d.id);
    try {
      const r = await api<{ ok: boolean; error?: string }>(`/api/servers/${id}/custom-domains/${d.id}/verify`, { method: "POST" });
      toast(r.ok ? "Domain is live over HTTPS 🎉" : r.error || "Not pointing here yet — check the DNS record.", r.ok ? "success" : "error");
      await load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setWorking(null);
    }
  }

  async function remove(d: CustomDomain) {
    if (!(await confirmDialog({ title: `Disconnect ${d.hostname}?`, description: "It will stop resolving to this server.", danger: true, confirmLabel: "Disconnect" }))) return;
    setWorking(d.id);
    try {
      await api(`/api/servers/${id}/custom-domains/${d.id}`, { method: "DELETE" });
      await load();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setWorking(null);
    }
  }

  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="glass p-5">
      <h3 className="flex items-center gap-2 font-display font-semibold text-white">
        <Globe className="h-4 w-4 text-cyan" /> Custom domain
      </h3>
      <p className="mt-1 text-sm text-white/45">
        Point your own domain at this server — the platform&apos;s reverse proxy handles{" "}
        <span className="text-white/70">automatic HTTPS</span>. Best for web apps, dashboards or map viewers.
      </p>

      {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {isOwner && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={host}
            onChange={(e) => setHost(e.target.value.toLowerCase())}
            placeholder="app.yourdomain.com"
            className="input min-w-[14rem] flex-1"
          />
          <select value={port} onChange={(e) => setPort(Number(e.target.value))} className="input w-auto">
            {state.ports.map((p) => (
              <option key={p.port} value={p.port}>
                → port {p.port} ({p.role})
              </option>
            ))}
          </select>
          <button onClick={add} disabled={busy || !host} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
      )}

      {state.domains.length > 0 && (
        <ul className="mt-4 space-y-3">
          {state.domains.map((d) => (
            <li key={d.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-white">{d.hostname}</span>
                {statusBadge(d.status)}
                <span className="text-xs text-white/35">→ port {d.targetPort}</span>
                <div className="ml-auto flex items-center gap-1.5">
                  {d.status === "active" && (
                    <a href={`https://${d.hostname}`} target="_blank" rel="noreferrer" className="rounded p-1 text-cyan hover:text-cyan-light" title="Open">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  {isOwner && (
                    <button onClick={() => remove(d)} disabled={working === d.id} className="rounded p-1 text-white/30 hover:text-danger" title="Disconnect">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {d.status !== "active" && (
                <div className="mt-3 space-y-2 rounded-lg border border-white/5 bg-black/20 p-3 text-xs">
                  <p className="text-white/50">At your DNS provider, create this record, then verify:</p>
                  <div className="flex flex-wrap items-center gap-2 font-mono text-cyan-light">
                    <span className="rounded bg-white/5 px-1.5 py-0.5">A</span>
                    <span>{d.hostname}</span>
                    <span className="text-white/30">→</span>
                    <button onClick={() => copy(state.target)} className="inline-flex items-center gap-1 rounded bg-white/5 px-1.5 py-0.5 hover:text-white">
                      {state.target} {copied === state.target ? <Check className="h-3 w-3 text-online" /> : <Copy className="h-3 w-3" />}
                    </button>
                  </div>
                  {d.lastError && (
                    <p className="flex items-center gap-1.5 text-warn">
                      <AlertTriangle className="h-3.5 w-3.5" /> {d.lastError}
                    </p>
                  )}
                  {isOwner && (
                    <button onClick={() => verify(d)} disabled={working === d.id} className="btn-ghost mt-1">
                      {working === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify & enable HTTPS
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SftpCard({ host, serverId }: { host: string; serverId: string }) {
  const [username, setUsername] = useState<string>("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    api<{ user: { username: string } }>("/api/me").then((r) => setUsername(r.user.username)).catch(() => {});
  }, []);
  const sftpUser = `${username || "<username>"}.${serverId}`;
  const copy = async (t: string) => {
    await navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="glass p-5">
      <h3 className="flex items-center gap-2 font-display font-semibold text-white"><Link2 className="h-4 w-4 text-cyan" /> SFTP access</h3>
      <p className="mt-1 text-sm text-white/45">Connect with any SFTP client (FileZilla, WinSCP) using your account password.</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-wide text-white/35">Host</div>
          <div className="font-mono text-sm text-cyan-light">{host}</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
          <div className="text-[11px] uppercase tracking-wide text-white/35">Port</div>
          <div className="font-mono text-sm text-cyan-light">2022</div>
        </div>
        <div className="rounded-xl border border-white/5 bg-black/20 p-3">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-white/35">Username</div>
            <button onClick={() => copy(sftpUser)} className="text-white/40 hover:text-white">
              {copied ? <Check className="h-3.5 w-3.5 text-online" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="truncate font-mono text-sm text-cyan-light">{sftpUser}</div>
        </div>
      </div>
    </div>
  );
}
