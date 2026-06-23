"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Cpu, MemoryStick, HardDrive, Star } from "lucide-react";
import { StateBadge } from "./state-badge";
import { formatBytes, cn } from "@/lib/util";

export interface ServerCard {
  id: string;
  name: string;
  icon: string;
  templateName: string;
  address: string;
  state: string;
  memoryMb: number;
  cpuPercent: number;
  diskMb: number;
}

/**
 * Client server grid with favourites: star a server to pin it to the top.
 * Favourites persist in localStorage. A small detail that matters once you
 * run more than a handful of servers — no competitor panel pins favourites.
 */
export function ServerGrid({ servers }: { servers: ServerCard[] }) {
  const [favs, setFavs] = useState<string[]>([]);

  useEffect(() => {
    try {
      const r = localStorage.getItem("mgg:favorites");
      if (r) setFavs(JSON.parse(r));
    } catch {
      /* ignore */
    }
  }, []);

  function toggle(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFavs((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("mgg:favorites", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const favSet = new Set(favs);
  const sorted = [...servers].sort((a, b) => (favSet.has(b.id) ? 1 : 0) - (favSet.has(a.id) ? 1 : 0));

  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {sorted.map((s) => {
        const fav = favSet.has(s.id);
        return (
          <Link
            key={s.id}
            href={`/dashboard/servers/${s.id}`}
            className="group relative glass p-5 transition hover:border-white/20 hover:bg-white/[0.07]"
          >
            <button
              onClick={(e) => toggle(s.id, e)}
              title={fav ? "Retirer des favoris" : "Épingler en favori"}
              className={cn(
                "absolute right-3 top-3 z-10 rounded-md p-1 transition",
                fav ? "text-warn" : "text-white/20 opacity-0 hover:text-white/70 group-hover:opacity-100",
              )}
            >
              <Star className={cn("h-4 w-4", fav && "fill-warn")} />
            </button>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/30 text-xl">
                  {s.icon}
                </span>
                <div>
                  <h3 className="font-display font-semibold text-white">{s.name}</h3>
                  <p className="text-xs text-white/40">{s.templateName}</p>
                </div>
              </div>
              <div className="mr-7">
                <StateBadge state={s.state} />
              </div>
            </div>
            <div className="mt-4 rounded-lg border border-white/5 bg-black/20 px-3 py-2 font-mono text-xs text-cyan-light">
              {s.address}
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs text-white/45">
              <span className="flex items-center gap-1.5">
                <MemoryStick className="h-3.5 w-3.5" /> {formatBytes(s.memoryMb * 1024 * 1024, 0)}
              </span>
              <span className="flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5" /> {s.cpuPercent}%
              </span>
              <span className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5" /> {formatBytes(s.diskMb * 1024 * 1024, 0)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
