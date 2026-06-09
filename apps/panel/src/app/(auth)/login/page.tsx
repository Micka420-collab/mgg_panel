"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client";
import { useT } from "@/i18n/client";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useT();
  const [stage, setStage] = useState<"creds" | "2fa">("creds");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitCreds(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api<{ needs2fa: boolean }>("/api/auth/login", { method: "POST", json: { email, password } });
      if (res.needs2fa) setStage("2fa");
      else router.push("/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function submit2fa(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api("/api/auth/2fa", { method: "POST", json: { code } });
      router.push("/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-raised p-8">
      <h1 className="font-display text-2xl font-bold text-white">
        {stage === "creds" ? t("auth.welcomeBack") : t("auth.twoFactorTitle")}
      </h1>
      <p className="mt-1 text-sm text-white/50">
        {stage === "creds" ? t("auth.signInSubtitle") : t("auth.twoFactorSubtitle")}
      </p>

      {error && <div className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {stage === "creds" ? (
        <form onSubmit={submitCreds} className="mt-6 space-y-4">
          <div>
            <label className="label">{t("auth.email")}</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <label className="label">{t("auth.password")}</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn-primary w-full py-3" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("auth.signIn")}
          </button>
        </form>
      ) : (
        <form onSubmit={submit2fa} className="mt-6 space-y-4">
          <div>
            <label className="label">{t("auth.authCode")}</label>
            <input
              className="input text-center font-mono text-lg tracking-[0.4em]"
              inputMode="numeric"
              maxLength={9}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              required
              autoFocus
            />
          </div>
          <button className="btn-primary w-full py-3" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><ShieldCheck className="h-4 w-4" /> {t("auth.verify")}</>)}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-white/50">
        {t("auth.noAccount")}{" "}
        <Link href="/register" className="text-cyan-light hover:underline">
          {t("auth.createOne")}
        </Link>
      </p>
    </div>
  );
}
