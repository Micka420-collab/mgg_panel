import Link from "next/link";
import { Boxes, Plug, Code2, Server, ArrowRight } from "lucide-react";

export default function DocsOverview() {
  return (
    <div className="space-y-6 text-white/70">
      <h1 className="font-display text-4xl font-bold text-white">Documentation</h1>
      <p className="text-lg text-white/55">
        MGG is a multi-game server hosting platform: a stateless Next.js <strong className="text-white">panel</strong>{" "}
        (control plane) plus a per-node <strong className="text-white">daemon</strong> (data plane) that drives Docker.
        Minecraft and Icarus ship today; new games are added as data via the template engine.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { icon: Boxes, title: "Game templates", body: "How Minecraft, Icarus, Valheim, Rust & Palworld are modelled as a single egg schema.", href: "/docs/api" },
          { icon: Plug, title: "Launcher API", body: "Device-code auth + endpoints so your custom launcher can list, start and join servers.", href: "/docs/launcher" },
          { icon: Code2, title: "REST API", body: "The full client + admin surface for automation and integrations.", href: "/docs/api" },
          { icon: Server, title: "Self-hosting", body: "One-command Ubuntu install: panel, daemon, Postgres and Caddy via Docker Compose.", href: "/docs/api" },
        ].map((c) => (
          <Link key={c.title} href={c.href} className="glass group p-5 transition hover:border-white/20">
            <c.icon className="h-6 w-6 text-cyan" />
            <h3 className="mt-3 font-display font-semibold text-white">{c.title}</h3>
            <p className="mt-1 text-sm text-white/55">{c.body}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm text-cyan-light">
              Read <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>

      <div className="glass p-6">
        <h2 className="font-display text-xl font-semibold text-white">Quick start (self-host)</h2>
        <pre className="console-surface mt-4 overflow-x-auto rounded-xl p-4 font-mono text-sm text-console-text">
{`git clone <your-repo> mgg && cd mgg
sudo bash deploy/install.sh
# → open the printed URL, register (first account = admin)`}
        </pre>
      </div>
    </div>
  );
}
