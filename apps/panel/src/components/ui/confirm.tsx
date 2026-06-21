"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from "lucide-react";
import { cn } from "@/lib/util";

/**
 * App-wide confirm dialog + toasts — a styled replacement for the browser's
 * `confirm()` / `alert()`. Mount <ConfirmProvider/> once (in the dashboard
 * layout), then call the standalone helpers anywhere:
 *
 *   if (!(await confirmDialog({ title: "Delete server?", danger: true }))) return;
 *   toast("Saved", "success");
 *
 * The helpers are plain functions (not hooks) wired to the mounted provider, so
 * any module can import them without touching React state. They fall back to the
 * native dialogs if the provider somehow isn't mounted (e.g. SSR).
 */

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

// Provider-registered implementations (set on mount).
let _confirm: ((o: ConfirmOptions) => Promise<boolean>) | null = null;
let _toast: ((message: string, kind: ToastKind) => void) | null = null;

/** Ask the user to confirm. Returns true if they accept. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  if (_confirm) return _confirm(opts);
  if (typeof window !== "undefined") {
    return Promise.resolve(window.confirm([opts.title, opts.description].filter(Boolean).join("\n\n")));
  }
  return Promise.resolve(false);
}

/** Show a transient toast notification. */
export function toast(message: string, kind: ToastKind = "info"): void {
  if (_toast) _toast(message, kind);
  else if (typeof window !== "undefined") window.alert(message);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    setMounted(true);
    let counter = 0;
    _confirm = (opts) => new Promise<boolean>((resolve) => setDialog({ ...opts, resolve }));
    _toast = (message, kind) => {
      const id = ++counter;
      setToasts((t) => [...t, { id, message, kind }]);
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
    };
    return () => {
      _confirm = null;
      _toast = null;
    };
  }, []);

  function close(value: boolean) {
    dialog?.resolve(value);
    setDialog(null);
  }

  const toastStyle: Record<ToastKind, string> = {
    success: "border-online/40 bg-online/15 text-online",
    error: "border-danger/40 bg-danger/15 text-danger",
    info: "border-cyan/40 bg-cyan/15 text-cyan-light",
  };
  const ToastIcon = { success: CheckCircle2, error: XCircle, info: Info } as const;

  return (
    <>
      {children}
      {mounted &&
        createPortal(
          <>
            {/* confirm dialog */}
            {dialog && (
              <div
                className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                role="dialog"
                aria-modal="true"
                onKeyDown={(e) => {
                  if (e.key === "Escape") close(false);
                  if (e.key === "Enter") close(true);
                }}
              >
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => close(false)} />
                <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-surface/95 p-6 shadow-2xl">
                  <button
                    onClick={() => close(false)}
                    className="absolute right-3 top-3 rounded-lg p-1.5 text-white/40 transition hover:bg-white/10 hover:text-white"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <div className="flex items-start gap-3">
                    <div className={cn("shrink-0 rounded-xl p-2.5", dialog.danger ? "bg-danger/15 text-danger" : "bg-cyan/15 text-cyan")}>
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 pt-0.5">
                      <h3 className="font-display text-lg font-semibold text-white">{dialog.title}</h3>
                      {dialog.description && (
                        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-white/55">{dialog.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end gap-2">
                    <button onClick={() => close(false)} className="btn-ghost">
                      {dialog.cancelLabel ?? "Cancel"}
                    </button>
                    <button
                      autoFocus
                      onClick={() => close(true)}
                      className={dialog.danger ? "btn-danger" : "btn-primary"}
                    >
                      {dialog.confirmLabel ?? (dialog.danger ? "Delete" : "Confirm")}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* toasts — top-center popup with a rotating light border */}
            <div className="pointer-events-none fixed left-1/2 top-4 z-[110] flex -translate-x-1/2 flex-col items-center gap-2">
              {toasts.map((t) => {
                const Icon = ToastIcon[t.kind];
                return (
                  <div
                    key={t.id}
                    className={cn(
                      "spin-light pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-md animate-in slide-in-from-top-2",
                      toastStyle[t.kind],
                    )}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="leading-snug text-white/90">{t.message}</span>
                  </div>
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
