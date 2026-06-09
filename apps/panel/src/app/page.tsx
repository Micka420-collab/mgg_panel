import Link from "next/link";
import {
  Rocket,
  Moon,
  Boxes,
  Terminal,
  ShieldCheck,
  Gauge,
  HardDriveDownload,
  Plug,
  Globe,
  Sparkles,
  ArrowRight,
  Zap,
} from "lucide-react";
import { TEMPLATES } from "@mgg/shared";
import { AmbientBackground } from "@/components/ambient";
import { MarketingNav } from "@/components/marketing/nav";
import { Footer } from "@/components/marketing/footer";
import { Reveal } from "@/components/marketing/reveal";
import { CountUp } from "@/components/marketing/count-up";
import { ConsolePreview } from "@/components/marketing/console-preview";
import { Pricing } from "@/components/marketing/pricing";
import { DEFAULT_PLANS } from "@/lib/plans";

const FEATURES = [
  { icon: Moon, title: "Wake-on-join sleeping", body: "Servers sleep when empty and wake the instant a player connects — with a live 'starting…' screen, never a connection error. Fair usage, no daily caps.", span: "md:col-span-2" },
  { icon: Boxes, title: "One-click mods & modpacks", body: "Search Modrinth & CurseForge in-panel. Dependencies auto-resolve so installs actually boot." },
  { icon: Terminal, title: "Live console + TPS", body: "Real-time console, command input and visible CPU / RAM / TPS / player count." },
  { icon: HardDriveDownload, title: "Automated backups", body: "World-safe snapshots (RCON-flushed), restore in one click, optional S3 offsite." },
  { icon: Plug, title: "Custom launcher API", body: "A clean versioned API + device-code auth so your own launcher lists, starts and joins servers.", span: "md:col-span-2" },
  { icon: ShieldCheck, title: "Hardened & isolated", body: "Per-container limits, TOTP 2FA, scoped API keys, audit logs and DDoS protection." },
];

const FAQ = [
  { q: "Which games can I host?", a: "Minecraft (Java & Bedrock — Paper, Purpur, Fabric, Forge, NeoForge, modpacks) and Icarus ship today. Valheim, Palworld and Rust are included too, and the template engine makes adding any game pure data." },
  { q: "Can I connect my own Minecraft launcher?", a: "Yes — that's a first-class feature. MGG exposes a device-code OAuth flow and a versioned REST + WebSocket API so your launcher can authenticate users, list their servers, fetch live connection info (ip:port), and start/stop/join with one call." },
  { q: "How does sleeping save me money?", a: "Idle servers stop and free node resources, then wake on the first join. You get unlimited play without paying for an always-on box — and we never bill crashed or errored runtime." },
  { q: "Is my data safe?", a: "Every server runs in an isolated container with strict CPU/RAM/PID limits. Backups are world-flushed before archiving, can be locked against deletion, and pushed to S3. Accounts support TOTP 2FA and scoped API keys." },
  { q: "Can I self-host MGG?", a: "Absolutely. MGG is a clean TypeScript monorepo (panel + daemon) that runs on a single Ubuntu box with Docker via a one-command installer." },
];

export default function LandingPage() {
  const games = TEMPLATES;
  return (
    <>
      <AmbientBackground dense />
      <MarketingNav />

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="relative px-6 pt-36 pb-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <Reveal>
              <span className="kicker">
                <Sparkles className="h-3.5 w-3.5" /> Multi-game hosting, reimagined
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight text-white sm:text-6xl text-balance">
                Game servers,
                <br />
                <span className="gradient-text">summoned in seconds.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 max-w-xl text-lg text-white/60">
                Deploy Minecraft, Icarus and more on premium Ryzen + NVMe hardware. A control panel that out-classes
                the rest, wake-on-join sleeping, one-click mods, and a clean API for your custom launcher.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/register" className="btn-primary px-5 py-3 text-base">
                  <Rocket className="h-4 w-4" /> Deploy your server
                </Link>
                <Link href="/#pricing" className="btn-ghost px-5 py-3 text-base">
                  See pricing <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-white/45">
                <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-cyan" /> Online in &lt; 60s</span>
                <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-cyan" /> DDoS protected</span>
                <span className="flex items-center gap-2"><Gauge className="h-4 w-4 text-cyan" /> 99.9% uptime</span>
                <span className="flex items-center gap-2">★ 4.9/5 from players</span>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.15}>
            <ConsolePreview />
          </Reveal>
        </div>
      </section>

      {/* ── Stats bar ────────────────────────────────────────── */}
      <section className="px-6">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:grid-cols-4">
          {[
            { v: 48213, s: "+", label: "Servers deployed" },
            { v: 12940, s: "", label: "Players online now" },
            { v: 99.9, s: "%", label: "Network uptime", d: 1 },
            { v: 6, s: "", label: "Global locations" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="font-display text-3xl font-bold text-white sm:text-4xl">
                <CountUp to={stat.v} suffix={stat.s} decimals={stat.d ?? 0} />
              </div>
              <div className="mt-1 text-sm text-white/45">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Games catalog ────────────────────────────────────── */}
      <section id="games" className="px-6 pt-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <span className="kicker"><Boxes className="h-3.5 w-3.5" /> Game catalog</span>
            <h2 className="mt-5 font-display text-4xl font-bold text-white">One panel. Every game.</h2>
            <p className="mt-3 max-w-2xl text-white/55">
              Pick a game and you&apos;re running in under a minute. Powered by a generic template engine — new games
              are added as data, not downtime.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((g, i) => (
              <Reveal key={g.id} delay={(i % 3) * 0.06}>
                <Link
                  href="/register"
                  className="group relative block h-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition hover:border-white/20 hover:bg-white/[0.07]"
                >
                  <div
                    className="absolute -right-8 -top-8 h-28 w-28 rounded-full blur-3xl opacity-40 transition group-hover:opacity-70"
                    style={{ background: g.color }}
                  />
                  <div className="relative flex items-center gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-black/30 text-2xl">
                      {g.icon}
                    </span>
                    <div>
                      <h3 className="font-display text-lg font-semibold text-white">{g.name}</h3>
                      <p className="text-xs text-white/45">{g.tagline}</p>
                    </div>
                  </div>
                  <p className="relative mt-4 text-sm text-white/55 line-clamp-3">{g.description}</p>
                  <div className="relative mt-4 flex flex-wrap gap-1.5">
                    {g.features.slice(0, 4).map((f) => (
                      <span key={f} className="chip text-[10px]">{f}</span>
                    ))}
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features bento ───────────────────────────────────── */}
      <section id="features" className="px-6 pt-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <span className="kicker"><Sparkles className="h-3.5 w-3.5" /> Why MGG</span>
            <h2 className="mt-5 font-display text-4xl font-bold text-white">Everything the others charge extra for.</h2>
          </Reveal>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={(i % 3) * 0.05} className={f.span}>
                <div className="glass h-full p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-cyan-violet/15 text-cyan">
                    <f.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold text-white">{f.title}</h3>
                  <p className="mt-2 text-sm text-white/55">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Launcher API ─────────────────────────────────────── */}
      <section id="launcher" className="px-6 pt-28">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2">
          <Reveal>
            <span className="kicker"><Plug className="h-3.5 w-3.5" /> Built for your launcher</span>
            <h2 className="mt-5 font-display text-4xl font-bold text-white">Connect your custom launcher.</h2>
            <p className="mt-4 text-white/60">
              A versioned REST + WebSocket API and a desktop-friendly device-code login. Authenticate a player, list
              their servers, pull live connection info, then auto-join — in a handful of calls.
            </p>
            <ul className="mt-6 space-y-3 text-sm text-white/70">
              {[
                "Device-code OAuth — no embedded secrets in your launcher",
                "GET /api/v1/client — every server the user can access",
                "GET …/connection — ip:port, status, players, MOTD for auto-join",
                "Scoped API keys + short-lived WebSocket tokens for live console",
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Globe className="mt-0.5 h-4 w-4 shrink-0 text-cyan" /> {t}
                </li>
              ))}
            </ul>
            <Link href="/docs/launcher" className="btn-ghost mt-7">
              Read the launcher guide <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
          <Reveal delay={0.1}>
            <div className="glass-raised overflow-hidden">
              <div className="border-b border-white/10 bg-white/[0.03] px-4 py-2.5 font-mono text-xs text-white/40">
                launcher.ts
              </div>
              <pre className="console-surface overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-console-text">
{`// 1 · authenticate (device code)
const { user_code, device_code } =
  await api.post("/api/v1/auth/device/start");
showToUser(user_code); // "AB12-CD34"

// 2 · poll until approved → tokens
const { access_token } =
  await api.poll("/api/v1/auth/device/poll",
                 { device_code });

// 3 · list servers & get join info
const { servers } = await api.get("/api/v1/client",
  { bearer: access_token });

const conn = await api.get(
  \`/api/v1/client/servers/\${servers[0].id}/connection\`);

// 4 · launch Minecraft straight into the server
minecraft.launch({
  server: conn.host, port: conn.port,
});`}
              </pre>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Performance band ─────────────────────────────────── */}
      <section className="px-6 pt-28">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl border border-cyan/20 bg-gradient-to-br from-cyan/10 via-transparent to-violet/10 p-10">
          <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
            <div>
              <h2 className="font-display text-3xl font-bold text-white">Bare-metal speed, zero lag.</h2>
              <p className="mt-3 max-w-xl text-white/60">
                AMD Ryzen 9 (5.0+ GHz), DDR5 memory and Gen4 NVMe storage. Tuned Aikar JVM flags out of the box, and a
                protocol-aware DDoS shield in front of every game port.
              </p>
            </div>
            <div className="flex gap-8">
              {[
                { v: "5.0GHz", l: "Ryzen 9" },
                { v: "DDR5", l: "Memory" },
                { v: "Gen4", l: "NVMe" },
              ].map((x) => (
                <div key={x.l} className="text-center">
                  <div className="font-display text-2xl font-bold text-cyan-light">{x.v}</div>
                  <div className="text-xs text-white/45">{x.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="px-6 pt-28">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <div className="text-center">
              <span className="kicker"><Gauge className="h-3.5 w-3.5" /> Simple pricing</span>
              <h2 className="mt-5 font-display text-4xl font-bold text-white">Pay for power, not promises.</h2>
              <p className="mx-auto mt-3 max-w-xl text-white/55">
                Transparent RAM-based tiers. Sleep when empty. Cancel anytime.
              </p>
            </div>
          </Reveal>
          <div className="mt-12">
            <Pricing plans={DEFAULT_PLANS.map((p) => ({ slug: p.slug, name: p.name, priceMonthly: p.priceMonthly, priceAnnual: p.priceAnnual, popular: p.popular, features: [...p.features] }))} />
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="px-6 pt-28">
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <h2 className="text-center font-display text-4xl font-bold text-white">Questions, answered.</h2>
          </Reveal>
          <div className="mt-10 space-y-3">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.04}>
                <details className="group glass p-5 [&_summary]:cursor-pointer">
                  <summary className="flex list-none items-center justify-between font-medium text-white">
                    {f.q}
                    <span className="text-cyan transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-white/55">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="px-6 pt-28">
        <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-white/10 bg-cyan-violet p-[1px]">
          <div className="rounded-3xl bg-base/85 px-8 py-14 text-center backdrop-blur-xl">
            <h2 className="font-display text-4xl font-bold text-white text-balance">Your server is one click away.</h2>
            <p className="mx-auto mt-3 max-w-lg text-white/60">
              Join thousands of communities running on MGG. Deploy free in seconds — no credit card to explore.
            </p>
            <div className="mt-8 flex justify-center gap-3">
              <Link href="/register" className="btn-primary px-6 py-3 text-base">
                <Rocket className="h-4 w-4" /> Get started free
              </Link>
              <Link href="/login" className="btn-ghost px-6 py-3 text-base">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
