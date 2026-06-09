"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { useT } from "@/i18n/client";

export default function RegisterPage() {
  const router = useRouter();
  const { t } = useT();
  const params = useSearchParams();
  const plan = params.get("plan");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/register", { method: "POST", json: { email, username, password } });
      router.push(plan ? `/dashboard/new?plan=${plan}` : "/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-raised p-8">
      <h1 className="font-display text-2xl font-bold text-white">{t("auth.createAccount")}</h1>
      <p className="mt-1 text-sm text-white/50">{t("auth.registerSubtitle")}</p>

      {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <div>
          <label className="label">{t("auth.username")}</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus minLength={3} maxLength={24} />
        </div>
        <div>
          <label className="label">{t("auth.email")}</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">{t("auth.password")}</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          <p className="mt-1 text-xs text-white/35">{t("auth.passwordMin")}</p>
        </div>
        <button className="btn-primary w-full py-3" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.signUp")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/50">
        {t("auth.haveAccount")}{" "}
        <Link href="/login" className="text-cyan-light hover:underline">
          {t("auth.signInLink")}
        </Link>
      </p>
    </div>
  );
}
