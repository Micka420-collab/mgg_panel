/**
 * MGG — core domain types shared between the panel, the daemon and the
 * public launcher API. Keep this dependency-free so every runtime can import it.
 */

/** Lifecycle state of a game server instance. */
export enum ServerState {
  Installing = "installing",
  Offline = "offline",
  Starting = "starting",
  Running = "running",
  Stopping = "stopping",
  Errored = "errored",
  Suspended = "suspended",
}

/** A power action the panel/launcher can request on a server. */
export type PowerAction = "start" | "stop" | "restart" | "kill";

/** Live resource statistics emitted by the daemon over the stats channel. */
export interface ServerStats {
  state: ServerState;
  /** CPU usage as a percentage of a single core (can exceed 100 on multi-core). */
  cpuPercent: number;
  /** CPU usage normalised to the server's limit, 0-100. */
  cpuPercentOfLimit: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  diskBytes: number;
  networkRxBytes: number;
  networkTxBytes: number;
  /** Seconds the container has been running, if any. */
  uptimeSeconds: number;
  /** Player count if the template can report it (e.g. via query/RCON). */
  players?: { online: number; max: number; sample?: string[] };
}

/** A line streamed from the server console. */
export interface ConsoleLine {
  ts: number;
  /** raw line including any colour codes */
  line: string;
  stream: "stdout" | "stderr" | "system";
}

/** Messages sent panel/browser -> daemon over the console websocket. */
export type ConsoleClientMessage =
  | { type: "auth"; token: string }
  | { type: "command"; command: string }
  | { type: "power"; action: PowerAction }
  | { type: "subscribe"; channels: ("console" | "stats")[] };

/** Messages sent daemon -> panel/browser over the console websocket. */
export type ConsoleServerMessage =
  | { type: "auth.ok"; serverId: string }
  | { type: "auth.error"; message: string }
  | { type: "console"; lines: ConsoleLine[] }
  | { type: "stats"; stats: ServerStats }
  | { type: "state"; state: ServerState }
  | { type: "install.output"; line: string }
  | { type: "error"; message: string };

/** A network port assigned to a server (allocation). */
export interface Allocation {
  id: string;
  ip: string;
  /** the externally reachable port */
  port: number;
  protocol: "tcp" | "udp" | "both";
  /** which template port this fills, e.g. "Game", "RCON", "Query" */
  role: string;
  primary: boolean;
}

/** What the daemon needs to fully (re)build a container. Panel -> daemon. */
export interface ServerBuildSpec {
  serverId: string;
  /** identifier of the resolved game template */
  templateId: string;
  dockerImage: string;
  startupCommand: string;
  stopSignal: string;
  /** console command (e.g. "stop") or "^SIGNAL" used for a graceful shutdown */
  stopCommand: string;
  /** regex against console output that marks the transition Starting -> Running */
  startupDoneRegex?: string;
  /** persistent data directory inside the container, bind-mounted to the host */
  containerDataPath: string;
  /** resolved environment variables (template defaults overlaid by user values) */
  environment: Record<string, string>;
  limits: {
    memoryMb: number;
    /** percentage of all cores, 100 = 1 core */
    cpuPercent: number;
    diskMb: number;
    /** swap in MB, -1 = unlimited, 0 = disabled */
    swapMb: number;
    /** Linux pids limit */
    pids: number;
    /** OOM killer disabled? */
    oomDisabled: boolean;
  };
  allocations: Allocation[];
  /** install step, run once before first boot */
  install?: InstallSpec;
  /** features the template advertises (rcon, eula, mods, ...) */
  features: string[];
  /** RCON connection details if the template supports it */
  rcon?: { port: number; password: string };
  /** if true, the daemon binds the primary TCP port on loopback for the edge proxy (wake-on-join) */
  proxied?: boolean;
  /** seconds the server may stay empty before the edge proxy stops it */
  idleSeconds?: number;
}

export interface InstallSpec {
  containerImage: string;
  entrypoint: string;
  script: string;
  environment: Record<string, string>;
}

/** Result of a file listing from the daemon's file manager. */
export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  mode: string;
  modifiedAt: number;
  mime?: string;
}

export interface BackupMeta {
  id: string;
  name: string;
  sizeBytes: number;
  checksum: string;
  createdAt: number;
  completed: boolean;
  locked: boolean;
  storage: "local" | "s3";
}

/** Connection info handed to a launcher so a player can join. */
export interface ConnectionInfo {
  /** address a player types in the multiplayer screen */
  address: string;
  host: string;
  port: number;
  /** SRV-friendly hostname if configured */
  srv?: string;
  game: string;
  state: ServerState;
  players?: { online: number; max: number };
  version?: string;
  motd?: string;
}

/** Roles a user can hold at the platform level. */
export enum UserRole {
  User = "user",
  Admin = "admin",
}
