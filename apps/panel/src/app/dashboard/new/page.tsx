"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Rocket, Check, Upload, PackageOpen, Sparkles, Server, Gamepad2 } from "lucide-react";
import { api } from "@/lib/client";
import { CATEGORIES } from "@mgg/shared";
import { cn } from "@/lib/util";
import { DEFAULT_PLANS } from "@/lib/plans";
import { ModpackPicker } from "@/components/dashboard/modpack-picker";

interface TemplateView {
  id: string;
  game: string;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  category: string;
  features: string[];
  images: string[];
  defaultImage: string | null;
  variables: { key: string; name: string; description: string; type: string; default: string; options?: { value: string; label: string }[]; group: string }[];
}

export default function NewServerPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [templates, setTemplates] = useState<TemplateView[]>([]);
  const [selected, setSelected] = useState<TemplateView | null>(null);
  const [name, setName] = useState("");
  const [planSlug, setPlanSlug] = useState(params.get("plan") ?? "nebula");
  const [vars, setVars] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [deploying, setDeploying] = useState(false);
  // "new" = fresh world · "import" = bring an existing server (upload its files)
  const [mode, setMode] = useState<"new" | "import">("new");
  const [archive, setArchive] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [modpackSlug, setModpackSlug] = useState<string | null>(null);

  useEffect(() => {
    api<{ templates: TemplateView[] }>("/api/templates")
      .then((r) => setTemplates(r.templates))
      .catch((e) => setError(e.message));
  }, []);

  function pick(t: TemplateView) {
    setSelected(t);
    setName((n) => n || `My ${t.name.split(":")[0]!.trim()} Server`);
    const init: Record<string, string> = {};
    for (const v of t.variables) init[v.key] = v.default;
    setVars(init);
    setModpackSlug(null); // a fresh game resets any chosen modpack
  }

  const grouped = useMemo(() => {
    if (!selected) return {};
    return selected.variables.reduce<Record<string, TemplateView["variables"]>>((acc, v) => {
      (acc[v.group] ||= []).push(v);
      return acc;
    }, {});
  }, [selected]);

  async function deploy() {
    if (!selected) return;
    if (mode === "import" && !archive) {
      setError("Choose a .zip / .tar.gz archive of your existing server to import.");
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      setProgress(mode === "import" ? "Creating the server…" : null);
      // A chosen Modrinth modpack is merged in as MODRINTH_MODPACK; itzg installs it on first boot.
      const variables = modpackSlug && mode === "new" ? { ...vars, MODRINTH_MODPACK: modpackSlug } : vars;
      const res = await api<{ id: string }>("/api/servers", {
        method: "POST",
        json: { name, templateId: selected.id, planSlug, variables },
      });

      if (mode === "import" && archive) {
        setProgress(`Uploading & extracting ${archive.name}… this can take a while for large worlds.`);
        const up = await fetch(
          `/api/servers/${res.id}/import?name=${encodeURIComponent(archive.name)}&clear=1`,
          { method: "POST", body: archive, credentials: "include" },
        );
        if (!up.ok) {
          const t = await up.json().catch(() => ({} as any));
          throw new Error(t.error || `Import failed (${up.status})`);
        }
      }
      router.push(`/dashboard/servers/${res.id}`);
    } catch (e: any) {
      setError(e.message);
      setDeploying(false);
      setProgress(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-3xl font-bold text-white">Deploy a server</h1>
      <p className="mt-1 text-sm text-white/50">Start fresh, or import an existing Minecraft / Icarus server you already have.</p>

      {/* mode: new world vs import existing */}
      <div className="mt-5 inline-flex rounded-2xl border border-white/10 bg-white/[0.03] p-1">
        <button
          onClick={() => setMode("new")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
            mode === "new" ? "bg-cyan/15 text-white" : "text-white/50 hover:text-white",
          )}
        >
          <Sparkles className="h-4 w-4" /> New server
        </button>
        <button
          onClick={() => setMode("import")}
          className={cn(
            "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
            mode === "import" ? "bg-cyan/15 text-white" : "text-white/50 hover:text-white",
          )}
        >
          <PackageOpen className="h-4 w-4" /> Import existing
        </button>
      </div>

      {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* service picker, grouped by category (Jeux / Hébergement) */}
        <div>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">1 · Choisis un service</h2>
          {templates.length === 0 && <Loader2 className="h-5 w-5 animate-spin text-cyan" />}
          {(["Jeux", "Hébergement"] as const).map((groupName) => {
            const cats = CATEGORIES.filter((c) => c.group === groupName && templates.some((t) => t.category === c.key));
            if (cats.length === 0) return null;
            return (
              <div key={groupName} className="mb-7">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white/85">
                  {groupName === "Hébergement" ? <Server className="h-4 w-4 text-violet" /> : <Gamepad2 className="h-4 w-4 text-cyan" />}
                  {groupName}
                  {groupName === "Hébergement" && (
                    <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet">
                      Bases de données · Web · Apps
                    </span>
                  )}
                </div>
                {cats.map((c) => {
                  const items = templates.filter((t) => t.category === c.key);
                  return (
                    <div key={c.key} className="mb-4">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-white/35">{c.icon} {c.label}</div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {items.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => pick(t)}
                            className={cn(
                              "relative overflow-hidden rounded-2xl border p-4 text-left transition",
                              selected?.id === t.id ? "border-cyan/60 bg-white/[0.08]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
                            )}
                          >
                            {selected?.id === t.id && (
                              <span className="absolute right-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-cyan text-white">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                            <div className="flex items-center gap-3">
                              <span className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/30 text-xl">{t.icon}</span>
                              <div>
                                <div className="font-medium text-white">{t.name}</div>
                                <div className="text-xs text-white/40">{t.tagline}</div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* config */}
        <div className="glass-raised h-fit p-6">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/40">2 · Configure</h2>
          {!selected ? (
            <p className="text-sm text-white/40">Select a game to configure it.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <label className="label">Server name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
              </div>

              <div>
                <label className="label">Plan</label>
                <div className="grid grid-cols-3 gap-2">
                  {DEFAULT_PLANS.map((p) => (
                    <button
                      key={p.slug}
                      onClick={() => setPlanSlug(p.slug)}
                      className={cn(
                        "rounded-xl border px-2 py-2 text-center text-xs transition",
                        planSlug === p.slug ? "border-cyan/60 bg-cyan/10 text-white" : "border-white/10 text-white/60 hover:bg-white/5",
                      )}
                    >
                      <div className="font-semibold">{p.name}</div>
                      <div className="text-white/40">{p.memoryMb / 1024} GB</div>
                    </button>
                  ))}
                </div>
              </div>

              {Object.entries(grouped).map(([group, list]) => (
                <div key={group}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/30">{group}</div>
                  <div className="space-y-3">
                    {list.map((v) => (
                      <div key={v.key}>
                        <label className="label" title={v.description}>{v.name}</label>
                        {v.type === "enum" && v.options ? (
                          <select className="input" value={vars[v.key] ?? ""} onChange={(e) => setVars((s) => ({ ...s, [v.key]: e.target.value }))}>
                            {v.options.map((o) => (
                              <option key={o.value} value={o.value} className="bg-surface">{o.label}</option>
                            ))}
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
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {mode === "new" && selected.game === "minecraft" && (
                <ModpackPicker
                  onPick={(p) => setModpackSlug(p?.MODRINTH_MODPACK ?? null)}
                  selectedSlug={modpackSlug}
                  loader={(vars.TYPE ?? "").toLowerCase() || null}
                  version={vars.VERSION ?? null}
                />
              )}

              {mode === "import" && (
                <div className="rounded-2xl border border-cyan/25 bg-cyan/[0.05] p-4">
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium text-white">
                    <Upload className="h-4 w-4 text-cyan" /> Your server archive
                  </div>
                  <p className="mb-3 text-xs text-white/45">
                    Upload a <span className="text-white/70">.zip</span> or <span className="text-white/70">.tar.gz</span> of your
                    existing server folder (world, configs, plugins/mods…). A single wrapping folder is detected automatically.
                  </p>
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 bg-black/20 px-4 py-6 text-center text-sm text-white/60 transition hover:border-cyan/40 hover:text-white">
                    <input
                      type="file"
                      accept=".zip,.tar.gz,.tgz,.tar,application/zip,application/gzip,application/x-tar"
                      className="hidden"
                      onChange={(e) => setArchive(e.target.files?.[0] ?? null)}
                    />
                    {archive ? (
                      <span className="text-white">{archive.name} · {(archive.size / 1048576).toFixed(1)} MB</span>
                    ) : (
                      <span>Click to choose an archive…</span>
                    )}
                  </label>
                  <p className="mt-2 text-[11px] text-white/35">
                    Pick the same game type &amp; version as your original server above for the smoothest result.
                  </p>
                </div>
              )}

              {progress && (
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white/60">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan" /> {progress}
                </div>
              )}

              <button onClick={deploy} disabled={deploying || !name || (mode === "import" && !archive)} className="btn-primary w-full py-3 text-base">
                {deploying ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> {mode === "import" ? "Importing…" : "Deploying…"}</>
                ) : mode === "import" ? (
                  <><PackageOpen className="h-4 w-4" /> Import &amp; deploy</>
                ) : (
                  <><Rocket className="h-4 w-4" /> Deploy server</>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
