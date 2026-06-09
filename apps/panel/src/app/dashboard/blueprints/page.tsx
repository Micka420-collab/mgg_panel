"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Blocks, Search, Download, Rocket, Loader2, Trash2, Tag, X, Sparkles, User as UserIcon, Globe,
} from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";

interface Blueprint {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  game: string;
  templateName: string;
  color: string;
  modpack: string | null;
  planSlug: string | null;
  tags: string[];
  public: boolean;
  deploys: number;
  mine: boolean;
  createdAt: string;
}

const PLANS = [
  { slug: "", name: "Template default" },
  { slug: "spark", name: "Spark · 2 GB" },
  { slug: "nebula", name: "Nebula · 6 GB" },
  { slug: "quasar", name: "Quasar · 12 GB" },
];

export default function BlueprintsPage() {
  const [items, setItems] = useState<Blueprint[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [error, setError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState<Blueprint | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (scope === "mine") params.set("mine", "1");
      const res = await api<{ blueprints: Blueprint[] }>(`/api/blueprints?${params.toString()}`);
      setItems(res.blueprints);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, scope]);

  async function remove(b: Blueprint) {
    if (
      !(await confirmDialog({
        title: "Delete this blueprint?",
        description: `"${b.title}" will be permanently removed. This cannot be undone.`,
        danger: true,
        confirmLabel: "Delete",
      }))
    )
      return;
    try {
      await api(`/api/blueprints/${b.id}`, { method: "DELETE" });
      setItems((list) => list.filter((x) => x.id !== b.id));
    } catch (e: any) {
      toast(e.message, "error");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-bold text-white">
            <Blocks className="h-7 w-7 text-cyan" /> Blueprint marketplace
          </h1>
          <p className="mt-1 max-w-prose text-sm text-white/50">
            Deploy a perfectly-configured server in one click, or publish your own setup for others to spin up.
          </p>
        </div>
      </div>

      {/* controls */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
          <input
            className="input pl-9"
            placeholder="Search blueprints, modpacks, tags…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
          {(["all", "mine"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                scope === s ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {s === "all" ? <Globe className="h-3.5 w-3.5" /> : <UserIcon className="h-3.5 w-3.5" />}
              {s === "all" ? "Marketplace" : "Mine"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-5 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-cyan" />
        </div>
      ) : items.length === 0 ? (
        <div className="glass mt-8 flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-cyan-violet/15 text-cyan">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold text-white">
            {scope === "mine" ? "You haven't published any blueprints yet" : "No blueprints found"}
          </h2>
          <p className="mt-2 max-w-sm text-sm text-white/50">
            Open a server you own, go to its <span className="text-white/70">Settings</span> tab, and use “Publish as
            blueprint” to share your setup here.
          </p>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((b) => (
            <BlueprintCard key={b.id} b={b} onDeploy={() => setDeploying(b)} onDelete={() => remove(b)} />
          ))}
        </div>
      )}

      {deploying && <DeployModal b={deploying} onClose={() => setDeploying(null)} />}
    </div>
  );
}

function BlueprintCard({ b, onDeploy, onDelete }: { b: Blueprint; onDeploy: () => void; onDelete: () => void }) {
  return (
    <div className="group glass flex flex-col p-5 transition hover:border-white/20 hover:bg-white/[0.07]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span
            className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/30 text-xl"
            style={{ boxShadow: `inset 0 0 0 1px ${b.color}22` }}
          >
            {b.icon}
          </span>
          <div>
            <h3 className="font-display font-semibold text-white">{b.title}</h3>
            <p className="text-xs text-white/40">{b.templateName}</p>
          </div>
        </div>
        {!b.public && b.mine && (
          <span className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-white/40">
            Private
          </span>
        )}
      </div>

      {b.description && <p className="mt-3 line-clamp-3 text-sm text-white/55">{b.description}</p>}

      {b.modpack && (
        <p className="mt-2 truncate text-xs text-violet" title={b.modpack}>
          📦 {b.modpack}
        </p>
      )}

      {b.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.tags.map((t) => (
            <span
              key={t}
              className="flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/55"
            >
              <Tag className="h-3 w-3" /> {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
        <span className="flex items-center gap-1.5 text-xs text-white/40">
          <Download className="h-3.5 w-3.5" /> {b.deploys} deploy{b.deploys === 1 ? "" : "s"}
        </span>
        <div className="flex items-center gap-2">
          {b.mine && (
            <button onClick={onDelete} className="btn-ghost px-2 text-white/40 hover:text-danger" title="Delete blueprint">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={onDeploy} className="btn-primary px-3 py-1.5 text-sm">
            <Rocket className="h-4 w-4" /> Deploy
          </button>
        </div>
      </div>
    </div>
  );
}

function DeployModal({ b, onClose }: { b: Blueprint; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(`${b.title}`.slice(0, 60));
  const [planSlug, setPlanSlug] = useState(b.planSlug ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deploy() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ id: string }>(`/api/blueprints/${b.id}/deploy`, {
        method: "POST",
        json: { name: name.trim(), ...(planSlug ? { planSlug } : {}) },
      });
      router.push(`/dashboard/servers/${res.id}`);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-raised w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
            <Rocket className="h-5 w-5 text-cyan" /> Deploy “{b.title}”
          </h2>
          <button onClick={onClose} className="text-white/40 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-1 text-sm text-white/50">
          Spins up a new {b.templateName} server with this blueprint's startup settings
          {b.modpack ? " and modpack" : ""}.
        </p>

        <div className="mt-5 space-y-4">
          <div>
            <label className="label">Server name</label>
            <input className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label">Plan / resources</label>
            <select className="input" value={planSlug} onChange={(e) => setPlanSlug(e.target.value)}>
              {PLANS.map((p) => (
                <option key={p.slug} value={p.slug} className="bg-surface">
                  {p.name}
                  {b.planSlug && p.slug === b.planSlug ? " (recommended)" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button onClick={deploy} disabled={busy || !name.trim()} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Deploy server
          </button>
        </div>
      </div>
    </div>
  );
}
