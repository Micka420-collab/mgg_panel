"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Plus,
  CreditCard,
  Settings,
  HardDrive,
  BookOpen,
  CornerDownLeft,
} from "lucide-react";
import { api } from "@/lib/client";
import { cn } from "@/lib/util";

interface ServerItem {
  id: string;
  name: string;
  icon: string;
  templateName: string;
  state: string;
}

interface Item {
  id: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  href: string;
}

/**
 * Global command palette (Cmd/Ctrl+K) — jump to any server or page instantly.
 * A differentiating power-user feature: no competitor panel ships this.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [servers, setServers] = useState<ServerItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mgg:open-cmdk", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mgg:open-cmdk", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSel(0);
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    api<{ servers: ServerItem[] }>("/api/servers")
      .then((r) => setServers(r.servers))
      .catch(() => {});
    return () => clearTimeout(t);
  }, [open]);

  const staticItems: Item[] = useMemo(
    () => [
      { id: "nav-dash", label: "Tableau de bord", icon: <LayoutDashboard className="h-4 w-4" />, href: "/dashboard" },
      { id: "nav-new", label: "Nouveau serveur", icon: <Plus className="h-4 w-4" />, href: "/dashboard/new" },
      { id: "nav-billing", label: "Facturation", icon: <CreditCard className="h-4 w-4" />, href: "/dashboard/billing" },
      { id: "nav-storage", label: "Stockage", icon: <HardDrive className="h-4 w-4" />, href: "/dashboard/storage" },
      { id: "nav-account", label: "Compte", icon: <Settings className="h-4 w-4" />, href: "/dashboard/account" },
      { id: "nav-docs", label: "Docs", icon: <BookOpen className="h-4 w-4" />, href: "/docs" },
    ],
    [],
  );

  const results: Item[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const srv: Item[] = servers.map((s) => ({
      id: "srv-" + s.id,
      label: s.name,
      sub: s.templateName,
      icon: <span className="text-base leading-none">{s.icon}</span>,
      href: `/dashboard/servers/${s.id}`,
    }));
    const all = [...srv, ...staticItems];
    if (!q) return all;
    return all.filter((i) => i.label.toLowerCase().includes(q) || i.sub?.toLowerCase().includes(q));
  }, [servers, staticItems, query]);

  useEffect(() => {
    if (sel >= results.length) setSel(Math.max(0, results.length - 1));
  }, [results, sel]);

  const go = useCallback(
    (item?: Item) => {
      const target = item ?? results[sel];
      if (!target) return;
      setOpen(false);
      router.push(target.href);
    },
    [results, sel, router],
  );

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go();
    }
  }

  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-start justify-center p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-surface/95 shadow-2xl animate-in fade-in slide-in-from-top-2"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4">
          <Search className="h-4 w-4 text-white/35" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSel(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Aller à un serveur, une page…"
            spellCheck={false}
            className="flex-1 bg-transparent py-3.5 text-sm text-white outline-none placeholder:text-white/30"
          />
          <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">ESC</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-1.5">
          {results.length === 0 && <div className="px-3 py-6 text-center text-sm text-white/40">Aucun résultat</div>}
          {results.map((item, i) => (
            <button
              key={item.id}
              onMouseEnter={() => setSel(i)}
              onClick={() => go(item)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                i === sel ? "bg-cyan/15 text-white" : "text-white/70 hover:bg-white/5",
              )}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-black/30">
                {item.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {item.sub && <span className="block truncate text-xs text-white/35">{item.sub}</span>}
              </span>
              {i === sel && <CornerDownLeft className="h-3.5 w-3.5 text-white/30" />}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
