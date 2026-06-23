"use client";
import { useCallback, useEffect, useState } from "react";
import { Sparkles, Loader2, Check, Trash2, KeyRound } from "lucide-react";
import { api } from "@/lib/client";

type Provider = "anthropic" | "openrouter";

interface AiStatus {
  provider: Provider;
  model: string;
  configured: boolean;
  source: "db" | "env" | null;
  masked: string | null;
  defaults?: { anthropic: string; openrouter: string };
  validationWarning?: string;
}

const PROVIDERS: { id: Provider; label: string; hint: string; keyPlaceholder: string; keysUrl: string; keysLabel: string }[] = [
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    hint: "Active le Copilot agentique (il peut agir : power, settings, mods…). Clé sk-ant-…",
    keyPlaceholder: "sk-ant-…",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keysLabel: "console.anthropic.com",
  },
  {
    id: "openrouter",
    label: "OpenRouter (DeepSeek, Llama, GPT…)",
    hint: "Un seul compte, des centaines de modèles (DeepSeek, Llama, Qwen, GPT, Gemini…). Réponses + commandes en 1 clic. Clé sk-or-…",
    keyPlaceholder: "sk-or-v1-…",
    keysUrl: "https://openrouter.ai/keys",
    keysLabel: "openrouter.ai/keys",
  },
];

/**
 * Admin card to connect the AI Copilot — choose a provider (Anthropic or
 * OpenRouter), paste its API key and pick a model. The key is validated against
 * the provider, stored encrypted, and never returned to the browser.
 */
export function AiKeyCard() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [value, setValue] = useState("");
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await api<AiStatus>("/api/admin/ai");
      setStatus(s);
      setProvider(s.provider);
      setModel(s.model ?? "");
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const meta = PROVIDERS.find((p) => p.id === provider)!;
  const modelPlaceholder = status?.defaults?.[provider] ?? "";

  async function save() {
    setBusy("save");
    setError(null);
    setSaved(false);
    setWarning(null);
    try {
      const res = await api<AiStatus>("/api/admin/ai", {
        method: "PUT",
        json: {
          provider,
          ...(value.trim() ? { apiKey: value.trim() } : {}),
          ...(model.trim() ? { model: model.trim() } : {}),
        },
      });
      setStatus(res);
      setValue("");
      setModel(res.model ?? "");
      setWarning(res.validationWarning ?? null);
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError(null);
    try {
      setStatus(await api<AiStatus>(`/api/admin/ai?provider=${provider}`, { method: "DELETE" }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (!status) return null;

  const activeForThisProvider = status.configured && status.provider === provider;

  return (
    <div className="glass overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-medium text-white">
        <Sparkles className="h-4 w-4 text-cyan" /> Copilot IA — fournisseur &amp; clé
      </div>

      <div className="space-y-4 px-4 py-4">
        {error && (
          <div className="rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}
        {saved && !warning && (
          <div className="flex items-center gap-2 rounded-xl border border-online/30 bg-online/10 px-3 py-2 text-sm text-online">
            <Check className="h-4 w-4" /> Enregistré. Le Copilot utilise maintenant {meta.label}.
          </div>
        )}
        {warning && (
          <div className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-sm text-warn">{warning}</div>
        )}

        {/* provider selector */}
        <div className="flex flex-wrap gap-2">
          {PROVIDERS.map((p) => (
            <button
              key={p.id}
              onClick={() => setProvider(p.id)}
              className={
                "rounded-xl border px-3 py-1.5 text-sm font-medium transition " +
                (provider === p.id
                  ? "border-cyan/50 bg-cyan/10 text-cyan"
                  : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white")
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* status line */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {status.configured ? (
            <>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-online/30 bg-online/10 px-2.5 py-1 text-xs font-medium text-online">
                <Check className="h-3.5 w-3.5" /> Actif · {status.provider}
              </span>
              <span className="font-mono text-white/70">{status.masked}</span>
              <span className="text-xs text-white/40">
                modèle <code className="font-mono text-white/60">{status.model}</code>
                {status.source === "env" ? " · depuis l'environnement" : " · défini ici"}
              </span>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.04] px-2.5 py-1 text-xs text-white/60">
              Aucune clé — le Copilot tourne en mode hors-ligne (règles)
            </span>
          )}
        </div>

        <p className="text-xs text-white/45">{meta.hint}</p>

        {/* model */}
        <div>
          <label className="mb-1 block text-xs text-white/45">Modèle (optionnel)</label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={modelPlaceholder}
            spellCheck={false}
            className="input font-mono"
          />
        </div>

        {/* key + actions */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={activeForThisProvider ? `Remplacer la clé… (${meta.keyPlaceholder})` : meta.keyPlaceholder}
              className="input pl-9 font-mono"
            />
          </div>
          <button onClick={save} disabled={busy !== null} className="btn-primary">
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Enregistrer
          </button>
          {activeForThisProvider && status.source === "db" && (
            <button onClick={remove} disabled={busy !== null} className="btn-ghost text-danger">
              {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Retirer
            </button>
          )}
        </div>

        <p className="text-xs text-white/40">
          Obtiens une clé sur{" "}
          <a href={meta.keysUrl} target="_blank" rel="noreferrer" className="text-cyan-light hover:text-cyan">
            {meta.keysLabel}
          </a>
          . La clé est vérifiée puis stockée chiffrée — jamais renvoyée au navigateur. Tu peux changer de modèle sans
          re-saisir la clé.
        </p>
      </div>
    </div>
  );
}
