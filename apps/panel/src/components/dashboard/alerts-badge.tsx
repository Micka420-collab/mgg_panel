"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

interface AlertRow {
  resolved: boolean;
  level: string;
}

/**
 * Live unresolved-alerts count, shown as a red pill on the Admin nav item.
 * Surfaces the security / lag / AI-heartbeat alerts at a glance. Admin only
 * (only mounted on the admin nav entry).
 */
export function AlertsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ alerts: AlertRow[] }>("/api/admin/alerts")
        .then((r) => {
          if (alive) setCount(r.alerts.filter((a) => !a.resolved).length);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (count === 0) return null;
  return (
    <span
      title={`${count} alerte${count > 1 ? "s" : ""} non résolue${count > 1 ? "s" : ""}`}
      className="ml-auto grid min-w-[18px] place-items-center rounded-full bg-danger/90 px-1.5 text-[10px] font-bold text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
