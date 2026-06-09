"use client";
import { useState } from "react";
import { Github, RefreshCw, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { confirmDialog, toast } from "@/components/ui/confirm";

/** Admin-only: pull the latest code from GitHub and rebuild + restart the stack. */
export function UpdateCard() {
  const [busy, setBusy] = useState(false);

  async function update() {
    const ok = await confirmDialog({
      title: "Update MGG from GitHub?",
      description:
        "Pulls the latest code from the GitHub source, then rebuilds and restarts the panel & daemon. The panel will be briefly unavailable while it rebuilds (~1–3 min). Running game servers are NOT affected.",
      confirmLabel: "Update now",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api("/api/admin/update", { method: "POST" });
      toast("Update started — pulling from GitHub and rebuilding. The panel will restart shortly.", "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setBusy(false);
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
            <h3 className="font-display font-semibold text-white">Platform update</h3>
            <p className="mt-1 max-w-prose text-sm text-white/45">
              Pull the latest MGG release from the GitHub source and rebuild the panel &amp; daemon. Game servers keep
              running; the panel is briefly unavailable while it rebuilds.
            </p>
          </div>
        </div>
        <button onClick={update} disabled={busy} className="btn-primary shrink-0">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Update from GitHub
        </button>
      </div>
    </div>
  );
}
