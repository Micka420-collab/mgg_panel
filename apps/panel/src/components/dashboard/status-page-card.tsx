"use client";
import { useCallback, useEffect, useState } from "react";
import { Globe, Copy, Check, Loader2, ExternalLink } from "lucide-react";
import { api } from "@/lib/client";

/**
 * Enable / share a public, login-free status page for this server.
 * Generates an unguessable token; the shareable link is /status/<token>.
 */
export function StatusPageCard({ serverId }: { serverId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    api<{ token: string | null }>(`/api/servers/${serverId}/status-page`)
      .then((r) => setToken(r.token))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [serverId]);
  useEffect(() => {
    load();
  }, [load]);

  async function toggle(enabled: boolean) {
    setBusy(true);
    try {
      const r = await api<{ token: string | null }>(`/api/servers/${serverId}/status-page`, {
        method: "POST",
        json: { enabled },
      });
      setToken(r.token);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  const url = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/status/${token}` : "";

  function copy() {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  }

  if (!loaded) return null;

  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-medium text-white">
        <Globe className="h-4 w-4 text-cyan" /> Page de statut publique
      </div>
      <div className="space-y-3 px-4 py-4">
        <p className="text-sm text-white/45">
          Une page publique partageable (sans connexion) montrant l'état du serveur, les joueurs en ligne et l'adresse de
          connexion — idéale pour ta communauté (Discord, site web…).
        </p>
        {token ? (
          <>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="input flex-1 font-mono text-xs"
              />
              <button onClick={copy} title="Copier le lien" className="btn-ghost px-3">
                {copied ? <Check className="h-4 w-4 text-online" /> : <Copy className="h-4 w-4" />}
              </button>
              <a href={url} target="_blank" rel="noreferrer" title="Ouvrir" className="btn-ghost px-3 text-cyan-light">
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
            <button onClick={() => toggle(false)} disabled={busy} className="btn-ghost text-danger">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Désactiver
            </button>
          </>
        ) : (
          <button onClick={() => toggle(true)} disabled={busy} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />} Activer la page publique
          </button>
        )}
      </div>
    </div>
  );
}
