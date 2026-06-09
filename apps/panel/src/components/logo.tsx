import Link from "next/link";
import { cn } from "@/lib/util";

export function Logo({ className, href = "/" }: { className?: string; href?: string | null }) {
  const mark = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00B4D8" />
            <stop offset="100%" stopColor="#7C4DFF" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="#0E1422" />
        <path d="M32 12 L50 50 H40 L32 31 L24 50 H14 Z" fill="url(#lg)" />
        <circle cx="32" cy="30" r="20" fill="none" stroke="url(#lg)" strokeWidth="2" opacity="0.45" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight text-white">MGG</span>
    </span>
  );
  if (href === null) return mark;
  return <Link href={href}>{mark}</Link>;
}
