import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import {
  ServerState,
  type ConsoleLine,
  type PowerAction,
  type ServerBuildSpec,
  type ServerStats,
} from "@mgg/shared";
import {
  attachStdin,
  buildContainer,
  containerSpecHash,
  specHash,
  followLogs,
  hostVolumePath,
  inspect,
  internalPort,
  hostAvailableMb,
  killContainer,
  mapState,
  pullImage,
  rconHost,
  removeContainer,
  startContainer,
  stopContainer,
  streamStats,
} from "./docker.js";
import { sendRcon, queryPlayers } from "./rcon.js";
import { queryA2S } from "./a2s.js";
import { volumeSize } from "./files.js";
import { logger } from "./logger.js";
import { IcarusLogTracker, type IcarusEvent } from "./icarus-log.js";

const CONSOLE_BUFFER = 250;
const SPEC_FILE = ".mgg/spec.json";

interface Runtime {
  spec: ServerBuildSpec;
  state: ServerState;
  console: ConsoleLine[];
  lastStats?: ServerStats;
  startedAt?: number;
  stopLogs?: () => void;
  stopStats?: () => void;
  stdin?: NodeJS.ReadWriteStream;
  playerTimer?: NodeJS.Timeout;
  diskTimer?: NodeJS.Timeout;
  players?: { online: number; max: number; sample: string[]; admins?: string[] };
  /** Icarus has no RCON → a log tailer is the only source of the live roster. */
  icarusLog?: IcarusLogTracker;
  /** last measured query round-trip latency in ms (RCON/A2S) */
  latencyMs?: number;
  /** intent flag: we asked the container to stop, so a `die` event is clean (Offline), not a crash (Errored). */
  stopping?: boolean;
}

/**
 * The daemon's brain: owns the lifecycle and live state of every managed
 * server, and emits events the WebSocket hub relays to clients.
 *
 * Events (per server id):
 *   console:<id>  -> ConsoleLine[]
 *   stats:<id>    -> ServerStats
 *   state:<id>    -> ServerState
 *   install:<id>  -> string (install output line)
 */
class ServerManager extends EventEmitter {
  private servers = new Map<string, Runtime>();

  async init(): Promise<void> {
    await this.rehydrate();
  }

  /** On boot, reload persisted specs and resume streaming for running containers. */
  private async rehydrate(): Promise<void> {
    let dirs: string[] = [];
    try {
      const { config } = await import("./config.js");
      dirs = await fs.readdir(config.dataDir);
    } catch {
      return;
    }
    for (const id of dirs) {
      try {
        const raw = await fs.readFile(path.join(hostVolumePath(id), SPEC_FILE), "utf8");
        const spec = JSON.parse(raw) as ServerBuildSpec;
        const info = await inspect(id);
        const state = mapState(info);
        this.servers.set(id, { spec, state, console: [] });
        if (state === ServerState.Running) {
          this.beginStreaming(id);
          logger.info({ id }, "rehydrated running server");
        }
      } catch {
        /* not an mgg server dir */
      }
    }
  }

  has(serverId: string): boolean {
    return this.servers.has(serverId);
  }

  getSnapshot(serverId: string) {
    const rt = this.servers.get(serverId);
    if (!rt) return null;
    return { state: rt.state, stats: rt.lastStats ?? null, console: rt.console, players: rt.players ?? null };
  }

  getSpec(serverId: string): ServerBuildSpec | null {
    return this.servers.get(serverId)?.spec ?? null;
  }

  /** Routes for the edge proxy: proxied servers' public port → internal backend. */
  listProxyRoutes(): { serverId: string; listen: string; backend: string; idleSeconds: number }[] {
    const routes: { serverId: string; listen: string; backend: string; idleSeconds: number }[] = [];
    for (const [serverId, rt] of this.servers) {
      if (!rt.spec.proxied) continue;
      const primary = rt.spec.allocations.find((a) => a.primary);
      if (!primary) continue;
      routes.push({
        serverId,
        listen: `:${primary.port}`,
        backend: `127.0.0.1:${internalPort(primary.port)}`,
        idleSeconds: rt.spec.idleSeconds ?? 600,
      });
    }
    return routes;
  }

  /** Register/rebuild a server from its spec (idempotent) and persist the spec. */
  async register(spec: ServerBuildSpec, rebuild = true): Promise<void> {
    const existing = this.servers.get(spec.serverId);
    const rt: Runtime = existing ?? { spec, state: ServerState.Offline, console: [] };
    rt.spec = spec;
    this.servers.set(spec.serverId, rt);

    await fs.mkdir(path.join(hostVolumePath(spec.serverId), ".mgg"), { recursive: true });
    await fs.writeFile(path.join(hostVolumePath(spec.serverId), SPEC_FILE), JSON.stringify(spec, null, 2));

    if (rebuild) {
      this.setState(spec.serverId, ServerState.Installing);
      this.pushConsole(spec.serverId, `[MGG] Pulling image ${spec.dockerImage}…`, "system");
      try {
        await pullImage(spec.dockerImage, (l) => this.emit(`install:${spec.serverId}`, l));
      } catch (e) {
        logger.warn({ e, image: spec.dockerImage }, "image pull failed (may already exist locally)");
      }
      this.pushConsole(spec.serverId, "[MGG] Building container…", "system");
      await buildContainer(spec);
      this.setState(spec.serverId, ServerState.Offline);
      this.pushConsole(spec.serverId, "[MGG] Ready. Press Start to boot your server.", "system");
    }
  }

  async power(serverId: string, action: PowerAction): Promise<void> {
    const rt = this.requireRuntime(serverId);
    switch (action) {
      case "start": {
        if (rt.state === ServerState.Running || rt.state === ServerState.Starting) return;
        if (rt.state === ServerState.Installing)
          throw new Error("Server is still installing — please wait for it to finish, then press Start.");
        rt.stopping = false;
        // Admission control at START time: refuse if the host doesn't have enough
        // free RAM for this server right now (prevents host OOM). Uses real
        // MemAvailable, so it also accounts for containers started outside MGG
        // and the host's own processes — fits "run one heavy server at a time".
        {
          const reserveMb = Number(process.env.NODE_MEMORY_RESERVE_MB ?? 512);
          const availableMb = await hostAvailableMb();
          const needMb = rt.spec.limits.memoryMb;
          if (needMb > 0 && needMb > availableMb - reserveMb) {
            this.setState(serverId, ServerState.Offline);
            throw new Error(
              `Not enough free RAM to start: ~${availableMb} MB available, ${needMb} MB needed (keeping ${reserveMb} MB for the host). Stop another server first.`,
            );
          }
        }
        // MGG fix: rebuild the container ONLY when the spec changed (settings,
        // variables, limits, image) or it doesn't exist yet — so panel changes
        // apply on the next start, WITHOUT wiping images that keep their data in
        // the container layer (e.g. the Icarus/Wine image) on every plain
        // restart (which would re-download the game and lose worlds).
        this.setState(serverId, ServerState.Starting);
        const needsRebuild =
          !(await inspect(serverId)) || (await containerSpecHash(serverId)) !== specHash(rt.spec);
        if (needsRebuild) {
          this.pushConsole(serverId, "[MGG] Applying settings & building container…", "system");
          try {
            await pullImage(rt.spec.dockerImage, (l) => this.emit(`install:${serverId}`, l));
          } catch (e) {
            logger.warn({ e, image: rt.spec.dockerImage }, "pull before start failed (may exist locally)");
          }
          await buildContainer(rt.spec);
        }
        this.pushConsole(serverId, "[MGG] Starting server…", "system");
        await startContainer(serverId);
        rt.startedAt = Date.now();
        this.beginStreaming(serverId);
        break;
      }
      case "restart":
        this.pushConsole(serverId, "[MGG] Restarting…", "system");
        await this.gracefulStop(serverId);
        // MGG fix: rebuild only if the spec changed; otherwise just restart so
        // container-layer data (e.g. the Icarus game & saves) is preserved.
        if (!(await inspect(serverId)) || (await containerSpecHash(serverId)) !== specHash(rt.spec)) {
          await buildContainer(rt.spec);
        }
        await startContainer(serverId);
        rt.startedAt = Date.now();
        this.setState(serverId, ServerState.Starting);
        this.beginStreaming(serverId);
        break;
      case "stop":
        this.setState(serverId, ServerState.Stopping);
        this.pushConsole(serverId, "[MGG] Stopping server…", "system");
        await this.gracefulStop(serverId);
        break;
      case "kill":
        rt.stopping = true; // intentional — the resulting die is clean, not a crash
        this.pushConsole(serverId, "[MGG] Killing server (forced)…", "system");
        await killContainer(serverId);
        this.setState(serverId, ServerState.Offline);
        this.endStreaming(serverId);
        break;
    }
  }

  /** Graceful stop: prefer the template's console stop command, fall back to SIGTERM. */
  private async gracefulStop(serverId: string): Promise<void> {
    const rt = this.requireRuntime(serverId);
    // Mark intent up front (covers `restart`, which calls us without setting
    // Stopping) so the asynchronous docker `die` event is treated as a clean stop.
    rt.stopping = true;
    const stopCmd = rt.spec.stopCommand;
    try {
      // RCON-capable games with a real console command (e.g. Minecraft "stop").
      if (rt.spec.rcon && stopCmd && !stopCmd.startsWith("^")) {
        await sendRcon(await rconHost(serverId), rt.spec.rcon.port, rt.spec.rcon.password, stopCmd);
        await new Promise((r) => setTimeout(r, 1500));
      } else if (rt.stdin && stopCmd && !stopCmd.startsWith("^")) {
        // console-only games (e.g. Icarus): write the stop command to stdin
        rt.stdin.write(stopCmd + "\n");
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch {
      /* fall through to docker stop (sends StopSignal then SIGKILL) */
    }
    await stopContainer(serverId);
    this.setState(serverId, ServerState.Offline);
    this.endStreaming(serverId);
  }

  /** Redémarrage avec préavis : diffuse un compte à rebours in-game (RCON `say`)
   *  puis redémarre. Sans RCON / serveur arrêté → redémarre tout de suite (impossible
   *  de prévenir). Retourne immédiatement ; le décompte + restart tournent en fond. */
  async restartWithWarning(serverId: string, seconds: number): Promise<void> {
    const rt = this.requireRuntime(serverId);
    const warn = Math.max(1, Math.min(600, Math.floor(seconds) || 30));
    if (!rt.spec.rcon || rt.state !== ServerState.Running) {
      await this.power(serverId, "restart");
      return;
    }
    const host = await rconHost(serverId);
    const { port, password } = rt.spec.rcon;
    const say = (m: string) => sendRcon(host, port, password, `say ${m}`).catch(() => undefined);
    void (async () => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      let left = warn;
      await say(`§e[MGG] Redemarrage du serveur dans ${left}s.`);
      for (const mark of [60, 30, 15, 10, 5, 4, 3, 2, 1]) {
        if (mark >= left) continue;
        await sleep((left - mark) * 1000);
        left = mark;
        await say(`§eRedemarrage dans ${mark}s...`);
      }
      await sleep(left * 1000);
      await say("§cRedemarrage en cours...");
      await this.power(serverId, "restart").catch((e) => logger.warn({ e, serverId }, "warned restart failed"));
    })();
  }

  async sendCommand(serverId: string, command: string): Promise<void> {
    const rt = this.requireRuntime(serverId);
    if (rt.state !== ServerState.Running) throw new Error("server is not running");
    this.pushConsole(serverId, `> ${command}`, "system");
    if (rt.spec.rcon) {
      const res = await sendRcon(await rconHost(serverId), rt.spec.rcon.port, rt.spec.rcon.password, command);
      if (res?.trim()) this.pushConsole(serverId, res.trim(), "stdout");
      return;
    }
    // console-only games (e.g. Icarus): write to container stdin
    if (!rt.stdin) rt.stdin = await attachStdin(serverId);
    rt.stdin.write(command + "\n");
  }

  async destroy(serverId: string, purgeVolume = false): Promise<void> {
    this.endStreaming(serverId);
    await removeContainer(serverId, purgeVolume);
    this.servers.delete(serverId);
  }

  subscribe(
    serverId: string,
    handlers: {
      onConsole?: (lines: ConsoleLine[]) => void;
      onStats?: (s: ServerStats) => void;
      onState?: (s: ServerState) => void;
    },
  ): () => void {
    const c = (lines: ConsoleLine[]) => handlers.onConsole?.(lines);
    const s = (st: ServerStats) => handlers.onStats?.(st);
    const t = (st: ServerState) => handlers.onState?.(st);
    if (handlers.onConsole) this.on(`console:${serverId}`, c);
    if (handlers.onStats) this.on(`stats:${serverId}`, s);
    if (handlers.onState) this.on(`state:${serverId}`, t);
    return () => {
      this.off(`console:${serverId}`, c);
      this.off(`stats:${serverId}`, s);
      this.off(`state:${serverId}`, t);
    };
  }

  // ── internals ──────────────────────────────────────────────────────────

  private requireRuntime(serverId: string): Runtime {
    const rt = this.servers.get(serverId);
    if (!rt) throw new Error(`server ${serverId} is not registered on this node`);
    return rt;
  }

  private setState(serverId: string, state: ServerState) {
    const rt = this.servers.get(serverId);
    if (!rt) return;
    if (rt.state === state) return;
    rt.state = state;
    if (state === ServerState.Offline || state === ServerState.Errored) {
      rt.startedAt = undefined;
      rt.players = undefined;
    }
    this.emit(`state:${serverId}`, state);
  }

  private pushConsole(serverId: string, line: string, stream: ConsoleLine["stream"]) {
    const rt = this.servers.get(serverId);
    if (!rt) return;
    const entry: ConsoleLine = { ts: Date.now(), line, stream };
    rt.console.push(entry);
    if (rt.console.length > CONSOLE_BUFFER) rt.console.splice(0, rt.console.length - CONSOLE_BUFFER);
    this.emit(`console:${serverId}`, [entry]);
  }

  /** Is this an Icarus server? (Icarus has no RCON — we read its log instead.) */
  private isIcarus(rt: Runtime): boolean {
    return /icarus/i.test(rt.spec.dockerImage) || /icarus/i.test(rt.spec.templateId);
  }

  /** Turn an Icarus log event into a console line + optional Discord notification. */
  private handleIcarusEvent(serverId: string, e: IcarusEvent): void {
    const rt = this.servers.get(serverId);
    if (!rt?.icarusLog) return;
    rt.players = rt.icarusLog.snapshot();
    if (e.type === "join") {
      this.pushConsole(serverId, `>> ${e.player.name} a rejoint le serveur (${e.online}/${e.max})`, "stdout");
      void this.notifyDiscord(`:wave: **${e.player.name}** a rejoint **Icarus** — ${e.online}/${e.max} en ligne`);
    } else if (e.type === "leave") {
      const mins = Math.max(1, Math.round(e.sessionMs / 60000));
      this.pushConsole(serverId, `<< ${e.name} a quitté le serveur (${e.online}/${e.max}, session ~${mins} min)`, "stdout");
      void this.notifyDiscord(`:door: **${e.name}** a quitté **Icarus** — ${e.online}/${e.max} en ligne (session ~${mins} min)`);
    } else if (e.type === "crash") {
      this.pushConsole(serverId, `!! Crash détecté: ${e.line}`, "stderr");
      void this.notifyDiscord(`:boom: **Crash détecté sur Icarus** : \`${e.line.slice(0, 200)}\``);
    }
  }

  /**
   * Best-effort Discord notification via a webhook URL in the env. Dormant
   * until ICARUS_DISCORD_WEBHOOK (or the generic ALERT_WEBHOOK) is set — then
   * join/leave/crash events post to the channel automatically.
   */
  private async notifyDiscord(content: string): Promise<void> {
    const url = process.env.ICARUS_DISCORD_WEBHOOK || process.env.ALERT_WEBHOOK;
    if (!url) return;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, username: "MGG · Icarus" }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
    } catch {
      /* best-effort: never let a notification break the manager */
    }
  }

  private beginStreaming(serverId: string) {
    const rt = this.servers.get(serverId);
    if (!rt) return;
    this.endStreaming(serverId, false);

    const doneRe = rt.spec.startupDoneRegex ? new RegExp(rt.spec.startupDoneRegex) : null;

    followLogs(serverId, (line, kind) => {
      const entry: ConsoleLine = { ts: Date.now(), line, stream: kind };
      rt.console.push(entry);
      if (rt.console.length > CONSOLE_BUFFER) rt.console.splice(0, rt.console.length - CONSOLE_BUFFER);
      this.emit(`console:${serverId}`, [entry]);
      if (doneRe && rt.state === ServerState.Starting && doneRe.test(line)) {
        this.setState(serverId, ServerState.Running);
      }
    })
      .then((stop) => (rt.stopLogs = stop))
      .catch((e) => logger.warn({ e, serverId }, "log stream failed"));

    streamStats(serverId, (partial) => {
      const limitBytes = rt.spec.limits.memoryMb * 1024 * 1024;
      const stats: ServerStats = {
        ...partial,
        state: rt.state,
        memoryLimitBytes: limitBytes || partial.memoryLimitBytes,
        cpuPercentOfLimit:
          rt.spec.limits.cpuPercent > 0
            ? Math.min(100, Math.round((partial.cpuPercent / rt.spec.limits.cpuPercent) * 100))
            : 0,
        uptimeSeconds: rt.startedAt ? Math.floor((Date.now() - rt.startedAt) / 1000) : 0,
        diskBytes: rt.lastStats?.diskBytes ?? 0,
        players: rt.players
          ? { online: rt.players.online, max: rt.players.max, sample: rt.players.sample, admins: rt.players.admins }
          : undefined,
        latencyMs: rt.latencyMs,
      };
      rt.lastStats = stats;
      this.emit(`stats:${serverId}`, stats);
    })
      .then((stop) => (rt.stopStats = stop))
      .catch((e) => logger.warn({ e, serverId }, "stats stream failed"));

    // periodic player query + latency - RCON (Minecraft) or A2S (Source/Steam query games)
    // Icarus has NO RCON and A2S only yields a count → tail its log for the real
    // roster (names + SteamIDs) and surface join/leave/crash events.
    if (this.isIcarus(rt)) {
      const logPath = path.join(hostVolumePath(serverId), "drive_c/icarus/Saved/Logs/Icarus.log");
      const max = parseInt(rt.spec.environment["SERVER_MAX_PLAYERS"] ?? "", 10) || 8;
      const adminIds = new Set(
        (rt.spec.environment["ICARUS_ADMIN_STEAMIDS"] ?? "")
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter((s) => /^\d{17}$/.test(s)),
      );
      const tracker = new IcarusLogTracker(logPath, max, (e) => this.handleIcarusEvent(serverId, e), adminIds);
      rt.icarusLog = tracker;
      tracker.start().catch((e) => logger.warn({ e, serverId }, "icarus log tracker failed to start"));
      // Icarus answers A2S on a distinct Query port — keep a latency ping there.
      const qAlloc =
        rt.spec.allocations.find((a) => /query/i.test(a.role)) ??
        rt.spec.allocations.find((a) => a.primary) ??
        rt.spec.allocations[0];
      // mirror the tracker's roster into rt.players + measure latency
      rt.playerTimer = setInterval(async () => {
        if (rt.state !== ServerState.Running) return;
        if (rt.icarusLog) rt.players = rt.icarusLog.snapshot();
        if (qAlloc) {
          const t0 = Date.now();
          const r = await queryA2S(await rconHost(serverId), qAlloc.port).catch(() => null);
          if (r) rt.latencyMs = Date.now() - t0;
        }
      }, 5000);
    } else if (rt.spec.rcon) {
      rt.playerTimer = setInterval(async () => {
        if (rt.state !== ServerState.Running) return;
        const t0 = Date.now();
        const players = await queryPlayers(await rconHost(serverId), rt.spec.rcon!.port, rt.spec.rcon!.password);
        if (players) {
          rt.players = players;
          rt.latencyMs = Date.now() - t0;
        }
      }, 15000);
    } else if (rt.spec.features.includes("query")) {
      // A2S_INFO over UDP. ⚠️ Certains jeux (Icarus) répondent sur un port "Query"
      // DISTINCT du port de jeu → interroger l'allocation Query si elle existe,
      // sinon le port de jeu (Source-engine comme Garry's Mod = même port).
      const qAlloc =
        rt.spec.allocations.find((a) => /query/i.test(a.role)) ??
        rt.spec.allocations.find((a) => a.primary) ??
        rt.spec.allocations[0];
      if (qAlloc) {
        rt.playerTimer = setInterval(async () => {
          if (rt.state !== ServerState.Running) return;
          const t0 = Date.now();
          const players = await queryA2S(await rconHost(serverId), qAlloc.port);
          if (players) {
            rt.players = players;
            rt.latencyMs = Date.now() - t0;
          }
        }, 15000);
      }
    }
    // periodic disk usage
    rt.diskTimer = setInterval(async () => {
      rt.lastStats && (rt.lastStats.diskBytes = await volumeSize(serverId).catch(() => 0));
    }, 60000);
  }

  private endStreaming(serverId: string, clearStdin = true) {
    const rt = this.servers.get(serverId);
    if (!rt) return;
    rt.stopLogs?.();
    rt.stopStats?.();
    rt.stopLogs = undefined;
    rt.stopStats = undefined;
    if (rt.playerTimer) clearInterval(rt.playerTimer);
    if (rt.diskTimer) clearInterval(rt.diskTimer);
    rt.playerTimer = undefined;
    rt.diskTimer = undefined;
    rt.icarusLog?.stop();
    rt.icarusLog = undefined;
    if (clearStdin && rt.stdin) {
      try {
        rt.stdin.end();
      } catch {
        /* noop */
      }
      rt.stdin = undefined;
    }
  }

  /** Called by the docker-events watcher when a container changes state. */
  onDockerEvent(serverId: string, action: string) {
    const rt = this.servers.get(serverId);
    if (!rt) return;
    if (action === "die" || action === "stop") {
      // Clean stop only when WE asked for it; otherwise it's a crash. Docker emits
      // BOTH `die` and `stop` for one shutdown — do NOT clear the intent flag here,
      // or the second event would be misread as a crash and flip Offline → Errored.
      // The flag is cleared only when a fresh start begins.
      this.setState(serverId, rt.stopping ? ServerState.Offline : ServerState.Errored);
      this.endStreaming(serverId);
    } else if (action === "start") {
      rt.stopping = false;
      if (rt.state !== ServerState.Running) this.setState(serverId, ServerState.Starting);
      this.beginStreaming(serverId);
    }
  }
}

export const manager = new ServerManager();
