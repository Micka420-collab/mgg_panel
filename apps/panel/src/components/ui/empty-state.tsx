import type { LucideIcon } from "lucide-react";

/**
 * Polished empty state — an iconed, centered placeholder used across panels so
 * "nothing here yet" reads as intentional craft rather than a blank/broken view.
 */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-cyan/[0.07] text-cyan">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 font-display font-semibold text-white">{title}</h3>
      {text && <p className="mt-1.5 max-w-xs text-sm text-white/45">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
