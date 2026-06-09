"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, Plug } from "lucide-react";
import { api } from "@/lib/client";

export default function LinkLauncherPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [status, setStatus] = useState<"idle" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // bounce to login if not authenticated
    api("/api/me").catch(() => router.push("/login"));
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/v1/auth/device/approve", { method: "POST", json: { code } });
      setStatus("done");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (status === "done") {
    return (
      <div className="glass-raised p-8 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-online" />
        <h1 className="mt-4 font-display text-2xl font-bold text-white">Launcher connected</h1>
        <p className="mt-2 text-sm text-white/55">
          You can return to your launcher — it&apos;s now signed in to your MGG account.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-raised p-8">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-violet/15 text-cyan">
        <Plug className="h-5 w-5" />
      </span>
      <h1 className="mt-4 font-display text-2xl font-bold text-white">Connect a launcher</h1>
      <p className="mt-1 text-sm text-white/50">Enter the code shown in your launcher to authorize it.</p>

      {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <input
          className="input text-center font-mono text-xl uppercase tracking-[0.3em]"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="AB12-CD34"
          maxLength={9}
          required
          autoFocus
        />
        <button className="btn-primary w-full py-3" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Authorize launcher"}
        </button>
      </form>
    </div>
  );
}
