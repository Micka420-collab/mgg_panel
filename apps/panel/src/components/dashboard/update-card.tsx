"use client";
import { useState } from "react";
import { Github, RefreshCw, Loader2, RotateCw } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";
import { useT } from "@/i18n/client";

/** Admin-only: pull the latest code from GitHub, or just restart the panel to apply it. */
export function UpdateCard() {
  const { t } = useT();
  const [busy, setBusy] = useState<null | "update" | "restart">(null);

  async function update() {
    const ok = await confirmDialog({
      title: t("admin.updateConfirmTitle"),
      description: t("admin.updateConfirmDesc"),
      confirmLabel: t("admin.updateFromGithub"),
    });
    if (!ok) return;
    setBusy("update");
    try {
      await api("/api/admin/update", { method: "POST" });
      toast(t("admin.updateStarted"), "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function restart() {
    const ok = await confirmDialog({
      title: t("admin.restartConfirmTitle"),
      description: t("admin.restartConfirmDesc"),
      confirmLabel: t("admin.restartPanel"),
    });
    if (!ok) return;
    setBusy("restart");
    try {
      await api("/api/admin/restart", { method: "POST" });
      toast(t("admin.restartStarted"), "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="glass p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl border border-white/10 bg-cyan/10 p-2">
            <Github className="h-4 w-4 text-cyan" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-white">{t("admin.platformUpdate")}</h3>
            <p className="mt-1 max-w-prose text-sm text-white/45">{t("admin.platformUpdateDesc")}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button onClick={restart} disabled={!!busy} className="btn-ghost">
            {busy === "restart" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}{" "}
            {t("admin.restartPanel")}
          </button>
          <button onClick={update} disabled={!!busy} className="btn-primary">
            {busy === "update" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{" "}
            {t("admin.updateFromGithub")}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs text-white/35">{t("admin.restartPanelDesc")}</p>
    </div>
  );
}
