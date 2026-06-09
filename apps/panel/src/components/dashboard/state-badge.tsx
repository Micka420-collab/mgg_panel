"use client";
import { cn } from "@/lib/util";
import { useT } from "@/i18n/client";

const MAP: Record<string, { key: string; dot: string; text: string }> = {
  running: { key: "running", dot: "bg-online", text: "text-online" },
  starting: { key: "starting", dot: "bg-warn animate-pulse-dot", text: "text-warn" },
  installing: { key: "installing", dot: "bg-cyan animate-pulse-dot", text: "text-cyan-light" },
  stopping: { key: "stopping", dot: "bg-warn animate-pulse-dot", text: "text-warn" },
  offline: { key: "offline", dot: "bg-white/30", text: "text-white/50" },
  errored: { key: "errored", dot: "bg-danger", text: "text-danger" },
  suspended: { key: "suspended", dot: "bg-danger", text: "text-danger" },
};

export function StateBadge({ state, className }: { state: string; className?: string }) {
  const { t } = useT();
  const s = MAP[state] ?? MAP.offline!;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium",
        s.text,
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", s.dot)} />
      {t(`state.${s.key}`)}
    </span>
  );
}
