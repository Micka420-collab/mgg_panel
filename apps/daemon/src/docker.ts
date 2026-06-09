import Docker from "dockerode";
import { PassThrough } from "node:stream";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import { ServerState, type ServerBuildSpec, type ServerStats } from "@mgg/shared";
import { config } from "./config.js";
import { logger } from "./logger.js";

export const docker = new Docker({ socketPath: config.dockerSocket });

export function containerName(serverId: string): string {
  return `${config.prefix}_${serverId}`;
}

// ── daemon ↔ game-container networking ──────────────────────────────────────
// When the daemon runs inside a container (our Docker deployment), "127.0.0.1"
// is the daemon's OWN loopback — not the host — so it cannot reach a game
// server's RCON published on the host's 127.0.0.1. We instead put game
// containers on a dedicated bridge network the daemon also joins, and reach
// RCON by container name. The network is separate from the compose network, so
// game containers stay isolated from postgres/panel.
const GAME_NETWORK = "mgg-games";

let containerizedP: Promise<boolean> | null = null;
/** True when the daemon itself runs inside a container (vs. directly on the host). */
export function isContainerized(): Promise<boolean> {
  return (containerizedP ??= (async () => {
    try {
      await docker.getContainer(os.hostname()).inspect();
      return true;
    } catch {
      return false;
    }
  })());
}

async function daemonOnGameNetwork(): Promise<boolean> {
  try {
    const self = await docker.getContainer(os.hostname()).inspect();
    return Object.keys(self.NetworkSettings?.Networks ?? {}).includes(GAME_NETWORK);
  } catch {
    return false;
  }
}

let gameNetP: Promise<string | null> | null = null;
/**
 * Ensure the dedicated game network exists and the daemon is attached to it.
 * Returns the network name to put game containers on, or null on a host-mode
 * daemon (where 127.0.0.1 + host-published ports already work).
 *
 * We VERIFY the daemon is actually on the network before caching success:
 * createNetwork/connect swallow benign "already exists/attached" errors, but a
 * genuine failure must not be cached as success — otherwise game containers get
 * placed on a network the daemon can't reach and RCON-by-name breaks forever. On
 * real failure we reset the cache so the next buildContainer retries.
 */
export function ensureGameNetwork(): Promise<string | null> {
  if (gameNetP) return gameNetP;
  gameNetP = (async () => {
    if (!(await isContainerized())) return null;
    try {
      await docker.createNetwork({ Name: GAME_NETWORK, Driver: "bridge", CheckDuplicate: true });
    } catch {
      /* already exists */
    }
    try {
      await docker.getNetwork(GAME_NETWORK).connect({ Container: os.hostname() });
    } catch {
      /* may already be attached */
    }
    if (!(await daemonOnGameNetwork())) {
      gameNetP = null; // don't cache failure — allow a later retry
      logger.warn("daemon not attached to the game network; RCON-by-name unavailable until retry");
      return null;
    }
    return GAME_NETWORK;
  })();
  return gameNetP;
}

/**
 * Host the daemon should dial for a game container's RCON. Tied to
 * ensureGameNetwork so it matches where buildContainer actually placed the
 * container: the container name when the shared network is confirmed, else
 * 127.0.0.1 (host-mode daemon).
 */
export async function rconHost(serverId: string): Promise<string> {
  return (await ensureGameNetwork()) ? containerName(serverId) : "127.0.0.1";
}

/** Physical RAM of the host, in MB. */
export function hostMemoryMb(): number {
  return Math.round(os.totalmem() / (1024 * 1024));
}

/**
 * RAM actually available for new allocations, in MB. Reads /proc/meminfo's
 * MemAvailable (host-wide, so it accounts for ALL processes — including game
 * containers started outside MGG and reclaimable cache). Falls back to
 * os.freemem() off Linux. This is the basis for start-time admission so we never
 * start a server the host can't fit.
 */
export async function hostAvailableMb(): Promise<number> {
  try {
    const meminfo = await fs.readFile("/proc/meminfo", "utf8");
    const m = meminfo.match(/MemAvailable:\s+(\d+)\s+kB/);
    if (m) return Math.round(Number(m[1]) / 1024);
  } catch {
    /* not Linux / unreadable */
  }
  return Math.round(os.freemem() / (1024 * 1024));
}

/** Sum of the memory limits of currently-RUNNING MGG game containers (MB). */
export async function runningManagedMemoryMb(): Promise<number> {
  try {
    const list = await docker.listContainers({
      filters: { label: ["mgg.managed=true"], status: ["running"] },
    } as Docker.ContainerListOptions);
    let bytes = 0;
    for (const c of list) {
      const info = await docker.getContainer(c.Id).inspect().catch(() => null);
      bytes += info?.HostConfig?.Memory ?? 0;
    }
    return Math.round(bytes / (1024 * 1024));
  } catch {
    return 0;
  }
}

export function hostVolumePath(serverId: string): string {
  return path.join(config.dataDir, serverId);
}

/** Map Docker's container state to MGG's ServerState. */
export function mapState(info: Docker.ContainerInspectInfo | null): ServerState {
  if (!info) return ServerState.Offline;
  const s = info.State;
  if (s.Restarting) return ServerState.Starting;
  if (s.Running) return ServerState.Running;
  if (s.Dead || (s.ExitCode && s.ExitCode !== 0 && !s.Running)) return ServerState.Errored;
  return ServerState.Offline;
}

export async function getContainer(serverId: string): Promise<Docker.Container | null> {
  const c = docker.getContainer(containerName(serverId));
  try {
    await c.inspect();
    return c;
  } catch {
    return null;
  }
}

export async function inspect(serverId: string): Promise<Docker.ContainerInspectInfo | null> {
  try {
    return await docker.getContainer(containerName(serverId)).inspect();
  } catch {
    return null;
  }
}

/** Pull an image, streaming progress lines to a callback. */
export async function pullImage(image: string, onLine?: (line: string) => void): Promise<void> {
  logger.info({ image }, "pulling image");
  await new Promise<void>((resolve, reject) => {
    docker.pull(image, (err: unknown, stream: NodeJS.ReadableStream) => {
      if (err || !stream) return reject(err ?? new Error("no pull stream"));
      docker.modem.followProgress(
        stream,
        (doneErr: unknown) => (doneErr ? reject(doneErr) : resolve()),
        (ev: { status?: string; progress?: string }) => {
          if (onLine && ev.status) onLine(`${ev.status}${ev.progress ? " " + ev.progress : ""}`);
        },
      );
    });
  });
}

/** Internal host port = public port + offset, used when a server is fronted by the edge proxy. */
export const PROXY_PORT_OFFSET = 20000;
export function internalPort(port: number): number {
  return port + PROXY_PORT_OFFSET;
}

function buildPortBindings(spec: ServerBuildSpec) {
  const exposed: Record<string, {}> = {};
  const bindings: Record<string, { HostIp: string; HostPort: string }[]> = {};
  const primary = spec.allocations.find((a) => a.primary);
  for (const alloc of spec.allocations) {
    const protocols = alloc.protocol === "both" ? ["tcp", "udp"] : [alloc.protocol];
    for (const proto of protocols) {
      const key = `${alloc.port}/${proto}`;
      exposed[key] = {};
      const isRcon = alloc.role.toLowerCase() === "rcon";
      // Wake-on-join: bind the primary TCP port on loopback at an offset so the
      // edge proxy can own the public port. UDP (e.g. query) stays public.
      const proxiedTcp = spec.proxied && alloc === primary && proto === "tcp";
      if (proxiedTcp) {
        bindings[key] = [{ HostIp: "127.0.0.1", HostPort: String(internalPort(alloc.port)) }];
      } else {
        bindings[key] = [{ HostIp: isRcon ? "127.0.0.1" : "0.0.0.0", HostPort: String(alloc.port) }];
      }
    }
  }
  // RCON: keep strictly on loopback so the daemon can reach it but players cannot.
  if (spec.rcon) {
    const key = `${spec.rcon.port}/tcp`;
    exposed[key] = {};
    bindings[key] = [{ HostIp: "127.0.0.1", HostPort: String(spec.rcon.port) }];
  }
  return { exposed, bindings };
}

function memoryConfig(spec: ServerBuildSpec) {
  const mem = spec.limits.memoryMb * 1024 * 1024;
  let memorySwap: number;
  if (spec.limits.swapMb < 0) memorySwap = -1; // unlimited swap
  else if (spec.limits.swapMb === 0) memorySwap = mem; // swap disabled (== memory)
  else memorySwap = mem + spec.limits.swapMb * 1024 * 1024;
  return { Memory: mem, MemorySwap: memorySwap };
}

/** Create (or recreate) the container for a server from its build spec. */
export async function buildContainer(spec: ServerBuildSpec): Promise<void> {
  const name = containerName(spec.serverId);
  const volume = hostVolumePath(spec.serverId);
  await fs.mkdir(volume, { recursive: true });

  // Remove any stale container with the same name first.
  const existing = await getContainer(spec.serverId);
  if (existing) {
    try {
      await existing.remove({ force: true });
    } catch (e) {
      logger.warn({ e, name }, "failed to remove stale container");
    }
  }

  const { exposed, bindings } = buildPortBindings(spec);
  const { Memory, MemorySwap } = memoryConfig(spec);
  // Put the container on the daemon's game network so the daemon can reach its
  // RCON by name (null on a host-mode daemon — then 127.0.0.1 + host ports work).
  const gameNet = await ensureGameNetwork();

  const env = Object.entries(spec.environment).map(([k, v]) => `${k}=${v}`);

  const createOpts: Docker.ContainerCreateOptions = {
    name,
    Image: spec.dockerImage,
    Hostname: spec.serverId.slice(0, 12),
    Tty: false,
    OpenStdin: true,
    AttachStdin: true,
    StdinOnce: false,
    Env: env,
    Labels: {
      "mgg.managed": "true",
      "mgg.serverId": spec.serverId,
      "mgg.templateId": spec.templateId,
    },
    ExposedPorts: exposed,
    Cmd: spec.startupCommand ? ["/bin/sh", "-c", spec.startupCommand] : undefined,
    StopSignal: spec.stopSignal || "SIGTERM",
    StopTimeout: 90,
    HostConfig: {
      // Reachable by container name from the daemon (for RCON), and isolated from
      // the control plane — postgres/panel live on a separate compose network.
      ...(gameNet ? { NetworkMode: gameNet } : {}),
      Binds: [`${volume}:${spec.containerDataPath}`],
      PortBindings: bindings,
      Memory,
      MemorySwap,
      NanoCpus: Math.round((spec.limits.cpuPercent / 100) * 1e9),
      PidsLimit: spec.limits.pids,
      OomKillDisable: spec.limits.oomDisabled,
      RestartPolicy: { Name: "no" },
      // Hardening: no privilege escalation + drop dangerous capabilities a game
      // server never needs (bounds the blast radius of a compromised container).
      // Keep the default seccomp profile. Escalate per-template if a game needs more.
      SecurityOpt: ["no-new-privileges"],
      CapDrop: [
        "SYS_ADMIN", "SYS_MODULE", "SYS_RAWIO", "SYS_PTRACE", "SYS_BOOT", "SYS_TIME",
        "NET_ADMIN", "NET_RAW", "DAC_READ_SEARCH", "MKNOD", "AUDIT_WRITE", "SETFCAP",
      ],
      DnsSearch: [],
    },
  };

  logger.info({ name, image: spec.dockerImage }, "creating container");
  await docker.createContainer(createOpts);
}

export async function startContainer(serverId: string): Promise<void> {
  const c = await getContainer(serverId);
  if (!c) throw new Error("container not found; build it first");
  await c.start();
}

export async function stopContainer(serverId: string, timeout = 90): Promise<void> {
  const c = await getContainer(serverId);
  if (!c) return;
  try {
    await c.stop({ t: timeout });
  } catch (e: any) {
    if (e?.statusCode !== 304) throw e; // 304 = already stopped
  }
}

export async function killContainer(serverId: string): Promise<void> {
  const c = await getContainer(serverId);
  if (!c) return;
  try {
    await c.kill();
  } catch (e: any) {
    if (e?.statusCode !== 304) throw e;
  }
}

export async function removeContainer(serverId: string, purgeVolume = false): Promise<void> {
  const c = await getContainer(serverId);
  if (c) await c.remove({ force: true });
  if (purgeVolume) {
    await fs.rm(hostVolumePath(serverId), { recursive: true, force: true });
  }
}

/**
 * Follow container logs, demultiplexing stdout/stderr into line callbacks.
 * Returns a function that stops the stream.
 */
export async function followLogs(
  serverId: string,
  onLine: (line: string, stream: "stdout" | "stderr") => void,
  tail = 250,
): Promise<() => void> {
  const c = await getContainer(serverId);
  if (!c) throw new Error("container not found");

  const stream = (await c.logs({
    follow: true,
    stdout: true,
    stderr: true,
    tail,
    timestamps: false,
  })) as unknown as NodeJS.ReadableStream;

  const out = new PassThrough();
  const err = new PassThrough();
  const split = (src: PassThrough, kind: "stdout" | "stderr") => {
    let buf = "";
    src.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? "";
      for (const line of parts) onLine(line, kind);
    });
  };
  split(out, "stdout");
  split(err, "stderr");
  docker.modem.demuxStream(stream, out, err);

  return () => {
    try {
      (stream as any).destroy?.();
    } catch {
      /* noop */
    }
  };
}

/**
 * Open a persistent writable to the container's stdin. Used to drive games
 * that have no RCON (e.g. Icarus console-only admin). Returns the duplex stream;
 * write newline-terminated commands to it.
 */
export async function attachStdin(serverId: string): Promise<NodeJS.ReadWriteStream> {
  const c = await getContainer(serverId);
  if (!c) throw new Error("container not found");
  const stream = (await c.attach({
    stream: true,
    stdin: true,
    stdout: false,
    stderr: false,
    hijack: true,
  })) as unknown as NodeJS.ReadWriteStream;
  return stream;
}

/**
 * Stream live resource stats, normalised into ServerStats.
 * Returns a stop function.
 */
export async function streamStats(
  serverId: string,
  onStats: (stats: Omit<ServerStats, "state" | "players">) => void,
): Promise<() => void> {
  const c = await getContainer(serverId);
  if (!c) throw new Error("container not found");

  const stream = (await c.stats({ stream: true })) as unknown as NodeJS.ReadableStream;
  let buf = "";
  const onData = (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const part of parts) {
      if (!part.trim()) continue;
      try {
        const s = JSON.parse(part);
        onStats(normaliseStats(s));
      } catch {
        /* partial frame */
      }
    }
  };
  stream.on("data", onData);
  return () => {
    stream.removeListener("data", onData);
    try {
      (stream as any).destroy?.();
    } catch {
      /* noop */
    }
  };
}

function normaliseStats(s: any): Omit<ServerStats, "state" | "players"> {
  // CPU percentage (Linux cgroup stats)
  let cpuPercent = 0;
  try {
    const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
    const sysDelta = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
    const cores =
      s.cpu_stats.online_cpus || s.cpu_stats.cpu_usage.percpu_usage?.length || 1;
    if (sysDelta > 0 && cpuDelta > 0) cpuPercent = (cpuDelta / sysDelta) * cores * 100;
  } catch {
    /* no cpu yet */
  }

  const memoryBytes = (s.memory_stats?.usage ?? 0) - (s.memory_stats?.stats?.cache ?? 0);
  const memoryLimitBytes = s.memory_stats?.limit ?? 0;

  let rx = 0;
  let tx = 0;
  if (s.networks) {
    for (const net of Object.values<any>(s.networks)) {
      rx += net.rx_bytes ?? 0;
      tx += net.tx_bytes ?? 0;
    }
  }

  return {
    cpuPercent: Math.round(cpuPercent * 100) / 100,
    cpuPercentOfLimit: 0, // filled in by the manager using the configured limit
    memoryBytes: Math.max(0, memoryBytes),
    memoryLimitBytes,
    diskBytes: 0, // filled in by the manager (du of the volume)
    networkRxBytes: rx,
    networkTxBytes: tx,
    uptimeSeconds: 0,
  };
}
