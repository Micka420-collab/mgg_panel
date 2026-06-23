"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";

/** Live unread-notifications count, shown as a pill on the Notifications nav item. */
export function NotificationsBadge() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ unread: number }>("/api/notifications")
        .then((r) => alive && setCount(r.unread ?? 0))
        .catch(() => {});
    load();
    const t = setInterval(load, 30000);
    const onRead = () => load();
    window.addEventListener("mgg:notifications-read", onRead);
    return () => {
      alive = false;
      clearInterval(t);
      window.removeEventListener("mgg:notifications-read", onRead);
    };
  }, []);

  if (count === 0) return null;
  return (
    <span className="ml-auto grid min-w-[18px] place-items-center rounded-full bg-danger/90 px-1.5 text-[10px] font-bold text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}
