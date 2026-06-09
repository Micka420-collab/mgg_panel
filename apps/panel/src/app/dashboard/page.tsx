import Link from "next/link";
import { Plus, Cpu, MemoryStick, HardDrive, ServerOff } from "lucide-react";
import { getTemplate, buildAddress } from "@mgg/shared";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { StateBadge } from "@/components/dashboard/state-badge";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { NodeResources } from "@/components/dashboard/node-resources";
import { reconcileStates } from "@/lib/server-state";
import { DaemonClient } from "@/lib/daemon";
import { formatBytes } from "@/lib/util";
import { getServerI18n } from "@/i18n/server";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const user = await requireUser();
  const { t } = getServerI18n();
  const servers = await db.server.findMany({
    where: { OR: [{ ownerId: user.id }, { subusers: { some: { userId: user.id } } }] },
    include: { allocations: true, node: true },
    orderBy: { createdAt: "desc" },
  });
  // Real, current state from the node (heals "stuck on stopping/starting" rows).
  const states = await reconcileStates(servers);
  const runningCount = [...states.values()].filter((s) => s === "running").length;

  // Live host RAM for the resources widget (best-effort).
  let ramMb: { total: number; available: number } | null = null;
  const node = servers[0]?.node ?? (await db.node.findFirst());
  if (node) {
    try {
      const sys = await new DaemonClient(node).system();
      if (sys?.memTotal) {
        ramMb = {
          total: Math.round(sys.memTotal / 1048576),
          available: Math.round((sys.memAvailable ?? sys.memFree ?? 0) / 1048576),
        };
      }
    } catch {
      /* node unreachable */
    }
  }

  return (
    <div>
      <AutoRefresh seconds={6} />
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-white/50">
            {t(servers.length === 1 ? "dashboard.welcomeOne" : "dashboard.welcomeMany", {
              count: servers.length,
              name: user.username,
            })}
          </p>
        </div>
        <Link href="/dashboard/new" className="btn-primary hidden sm:inline-flex">
          <Plus className="h-4 w-4" /> {t("nav.newServer")}
        </Link>
      </div>

      {ramMb && servers.length > 0 && (
        <NodeResources totalMb={ramMb.total} availableMb={ramMb.available} running={runningCount} />
      )}

      {servers.length === 0 ? (
        <div className="glass mt-8 flex flex-col items-center justify-center px-6 py-20 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-cyan-violet/15 text-cyan">
            <ServerOff className="h-7 w-7" />
          </div>
          <h2 className="mt-5 font-display text-xl font-semibold text-white">{t("dashboard.emptyTitle")}</h2>
          <p className="mt-2 max-w-sm text-sm text-white/50">{t("dashboard.emptyText")}</p>
          <Link href="/dashboard/new" className="btn-primary mt-6">
            <Plus className="h-4 w-4" /> {t("dashboard.emptyCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {servers.map((s) => {
            const tpl = getTemplate(s.templateId);
            const primary = s.allocations.find((a) => a.primary) ?? s.allocations[0];
            const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;
            const address = primary ? buildAddress(primary.ip, primary.port, defaultPort) : "—";
            return (
              <Link
                key={s.id}
                href={`/dashboard/servers/${s.id}`}
                className="group glass p-5 transition hover:border-white/20 hover:bg-white/[0.07]"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-black/30 text-xl">
                      {tpl?.icon ?? "🎮"}
                    </span>
                    <div>
                      <h3 className="font-display font-semibold text-white">{s.name}</h3>
                      <p className="text-xs text-white/40">{tpl?.name ?? s.templateId}</p>
                    </div>
                  </div>
                  <StateBadge state={states.get(s.id) ?? s.state} />
                </div>
                <div className="mt-4 rounded-lg border border-white/5 bg-black/20 px-3 py-2 font-mono text-xs text-cyan-light">
                  {address}
                </div>
                <div className="mt-4 flex items-center gap-4 text-xs text-white/45">
                  <span className="flex items-center gap-1.5"><MemoryStick className="h-3.5 w-3.5" /> {formatBytes(s.memoryMb * 1024 * 1024, 0)}</span>
                  <span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5" /> {s.cpuPercent}%</span>
                  <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5" /> {formatBytes(s.diskMb * 1024 * 1024, 0)}</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
