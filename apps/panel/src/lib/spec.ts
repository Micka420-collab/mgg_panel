import type { Allocation as DbAllocation, Server } from "@prisma/client";
import {
  requireTemplate,
  interpolate,
  type Allocation,
  type ServerBuildSpec,
} from "@aether/shared";
import { env as appEnv } from "./env";

function mapProtocol(p: DbAllocation["protocol"]): Allocation["protocol"] {
  return p === "TCP" ? "tcp" : p === "UDP" ? "udp" : "both";
}

/**
 * Assemble the contract the daemon needs to (re)build a container, from the
 * persisted server row, its allocations and the (code) template.
 */
export function buildServerSpec(server: Server, allocations: DbAllocation[]): ServerBuildSpec {
  const template = requireTemplate(server.templateId);
  const env: Record<string, string> = { ...(server.environment as Record<string, string>) };

  // Inject allocated ports into their template env vars (match by port role/name).
  const primary = allocations.find((a) => a.primary) ?? allocations[0];
  for (const portSpec of template.ports) {
    const alloc =
      allocations.find((a) => a.role.toLowerCase() === portSpec.name.toLowerCase()) ??
      (portSpec.primary ? primary : undefined);
    if (alloc && portSpec.envVar) env[portSpec.envVar] = String(alloc.port);
  }
  // Aether-standard injected vars.
  if (primary) {
    env.SERVER_PORT = env.SERVER_PORT ?? String(primary.port);
    env.SERVER_IP = "0.0.0.0";
  }
  env.SERVER_MEMORY = String(server.memoryMb);

  // Garry's Mod: mount a Steam Workshop collection server-side (addons + maps)
  // by appending +host_workshop_collection to the launch line when one is set.
  if (template.game === "garrysmod" && env.WORKSHOP_COLLECTION && !/host_workshop_collection/.test(env.GAME_PARAMS ?? "")) {
    env.GAME_PARAMS = `${(env.GAME_PARAMS ?? "").trim()} +host_workshop_collection ${env.WORKSHOP_COLLECTION}`.trim();
  }

  // Inject the platform CurseForge key so itzg can fetch CF mods/modpacks.
  if (appEnv.curseforgeKey && template.game === "minecraft") env.CF_API_KEY = appEnv.curseforgeKey;

  // RCON wiring.
  let rcon: ServerBuildSpec["rcon"];
  if (template.rcon) {
    const rconAlloc = allocations.find((a) => a.role.toLowerCase() === "rcon");
    const port = rconAlloc?.port ?? template.rcon.defaultPort;
    const password = env[template.rcon.envPassword] ?? "";
    env[template.rcon.envPort] = String(port);
    rcon = { port, password };
  }

  const sharedAllocations: Allocation[] = allocations.map((a) => ({
    id: a.id,
    ip: a.ip,
    port: a.port,
    protocol: mapProtocol(a.protocol),
    role: a.role,
    primary: a.primary,
  }));

  return {
    serverId: server.id,
    templateId: server.templateId,
    dockerImage: server.dockerImage,
    startupCommand: interpolate(template.startupCommand, env),
    stopSignal: template.stopSignal,
    stopCommand: template.stopCommand,
    startupDoneRegex: template.startupDoneRegex,
    containerDataPath: template.dataPath ?? "/data",
    environment: env,
    limits: {
      memoryMb: server.memoryMb,
      cpuPercent: server.cpuPercent,
      diskMb: server.diskMb,
      swapMb: server.swapMb,
      pids: 512,
      oomDisabled: false,
    },
    allocations: sharedAllocations,
    features: template.features,
    rcon,
    // wake-on-join: proxy TCP games that support auto-pause when autoStop is on
    proxied:
      server.autoStop &&
      template.features.includes("auto-pause") &&
      (primary?.protocol === "TCP" || primary?.protocol === "BOTH"),
    idleSeconds: server.idleTimeout,
  };
}
