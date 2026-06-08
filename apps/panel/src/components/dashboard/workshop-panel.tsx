"use client";
import { useCallback, useEffect, useState } from "react";
import { Search, Download, Check, X, Loader2, Package, Map as MapIcon, Info, ExternalLink, Plus, Library } from "lucide-react";
import { api } from "@/lib/client";
import { cn } from "@/lib/util";

interface Item {
  id: string;
  title: string;
  preview: string | null;
  kind: "addon" | "map";
  subs?: number;
}
type Kind = "addon" | "map";

export function WorkshopPanel({ id, canManage }: { id: string; canManage: boolean }) {
  const [addons, setAddons] = useState<Item[]>([]);
  const [maps, setMaps] = useState<Item[]>([]);
  const [collection, setCollection] = useState<string>("");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [kind, setKind] = useState<Kind>("addon");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ addons: Item[]; maps: Item[]; collection: string | null; searchEnabled: boolean }>(`/api/servers/${id}/workshop`);
    setAddons(r.addons);
    setMaps(r.maps);
    setCollection(r.collection ?? "");
    setSearchEnabled(r.searchEnabled);
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  const search = useCallback(
    async (query: string, k: Kind) => {
      setLoading(true);
      setError(null);
      try {
        const r = await api<{ hits: Item[]; error?: string }>(`/api/servers/${id}/workshop/search?q=${encodeURIComponent(query)}&kind=${k}`);
        setHits(r.hits ?? []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    if (!searchEnabled) return;
    const t = setTimeout(() => search(q, kind), 350);
    return () => clearTimeout(t);
  }, [q, kind, searchEnabled, search]);

  const installed = kind === "map" ? maps : addons;
  const isInstalled = (itemId: string) => installed.some((i) => i.id === itemId);

  async function add(itemId: string, k: Kind) {
    setBusy(itemId);
    setError(null);
    try {
      await api(`/api/servers/${id}/workshop`, { method: "POST", json: { id: itemId, kind: k } });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function remove(itemId: string) {
    await api(`/api/servers/${id}/workshop?id=${encodeURIComponent(itemId)}`, { method: "DELETE" }).catch((e) => setError(e.message));
    load();
  }
  async function saveCollection() {
    setBusy("collection");
    setError(null);
    try {
      await api(`/api/servers/${id}/workshop`, { method: "PUT", json: { collection } });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }
  async function addManual() {
    const v = manual.trim();
    if (!v) return;
    await add(v, kind);
    setManual("");
  }

  return (
    <div className="space-y-5">
      <div className="glass p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display font-semibold text-white">
            <Package className="h-4 w-4 text-cyan" /> Steam Workshop
          </h3>
          <span className="chip">Garry&apos;s Mod</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-white/10 bg-black/20 p-1">
            {(["addon", "map"] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  kind === k ? "bg-white/10 text-white" : "text-white/50 hover:text-white",
                )}
              >
                {k === "map" ? <MapIcon className="h-3.5 w-3.5" /> : <Package className="h-3.5 w-3.5" />}
                {k === "map" ? "Maps" : "Addons"}
              </button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              disabled={!searchEnabled}
              placeholder={searchEnabled ? `Search Workshop ${kind === "map" ? "maps" : "addons"}...` : "Workshop search disabled - add by URL below"}
              className="input pl-9 disabled:opacity-50"
            />
          </div>
        </div>

        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1">
              <ExternalLink className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addManual();
                }}
                placeholder={`Paste a Workshop ${kind} URL or ID, then Enter`}
                className="input pl-9"
              />
            </div>
            <button onClick={addManual} disabled={!manual.trim() || busy === manual.trim()} className="btn-primary !px-3 !py-2">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
        )}

        {error && <div className="mt-3 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-white/35">
          <Info className="h-3.5 w-3.5" /> Changes apply on the next server restart. Players auto-download these when they join.
        </p>
      </div>

      {searchEnabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          {loading && (
            <div className="col-span-full flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-cyan" />
            </div>
          )}
          {!loading &&
            hits.map((h) => {
              const inst = isInstalled(h.id);
              return (
                <div key={h.id} className="glass flex gap-3 p-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {h.preview ? (
                    <img src={h.preview} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-white/10 bg-black/30 object-cover" />
                  ) : (
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-white/10 bg-black/30 text-white/40">
                      <Package className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate font-medium text-white">{h.title}</h4>
                      {typeof h.subs === "number" && <span className="shrink-0 text-xs text-white/35">{h.subs.toLocaleString()} sub</span>}
                    </div>
                    <a
                      href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${h.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-white/40 hover:text-cyan"
                    >
                      <ExternalLink className="h-3 w-3" /> Workshop page
                    </a>
                    {canManage && (
                      <button
                        onClick={() => add(h.id, kind)}
                        disabled={inst || busy === h.id}
                        className={cn(
                          "mt-2 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition",
                          inst ? "bg-online/15 text-online" : "btn-primary !px-2.5 !py-1",
                        )}
                      >
                        {busy === h.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : inst ? <Check className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />}
                        {inst ? "Added" : "Add"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          {!loading && hits.length === 0 && <div className="col-span-full py-10 text-center text-sm text-white/30">{q ? "No results." : "Search the Workshop above."}</div>}
        </div>
      )}

      <div className="glass p-5">
        <h3 className="mb-2 flex items-center gap-2 font-display font-semibold text-white">
          <Library className="h-4 w-4 text-cyan" /> Workshop collection
        </h3>
        <p className="mb-3 text-xs text-white/40">
          A collection is mounted <span className="text-white/60">server-side</span> - the most reliable way to host custom maps &amp; gamemodes. Paste a collection URL or ID.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input value={collection} onChange={(e) => setCollection(e.target.value)} disabled={!canManage} placeholder="e.g. 2536576806 or its Workshop URL" className="input flex-1" />
          {canManage && (
            <button onClick={saveCollection} disabled={busy === "collection"} className="btn-primary !px-3 !py-2">
              {busy === "collection" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
          )}
        </div>
      </div>

      {(addons.length > 0 || maps.length > 0) && (
        <div className="glass p-5">
          <h3 className="mb-3 font-display font-semibold text-white">Installed</h3>
          {[
            { label: "Addons", arr: addons },
            { label: "Maps", arr: maps },
          ]
            .filter((g) => g.arr.length > 0)
            .map((g) => (
              <div key={g.label} className="mb-3 last:mb-0">
                <div className="mb-1.5 text-xs uppercase tracking-wider text-white/30">{g.label}</div>
                <div className="flex flex-wrap gap-2">
                  {g.arr.map((it) => (
                    <span key={it.id} className="chip gap-2">
                      {it.title}
                      {canManage && (
                        <button onClick={() => remove(it.id)} className="text-white/40 hover:text-danger">
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
