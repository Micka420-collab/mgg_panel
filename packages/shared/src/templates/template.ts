/**
 * The generic game-template schema (MGG's equivalent of a Pterodactyl "egg",
 * but typed). A template fully describes how to install, configure, boot, watch
 * and stop one kind of game server inside Docker. Minecraft and Icarus are the
 * first two templates; any SteamCMD / Java / custom game can be added by writing
 * one of these objects.
 */

export type VariableType = "string" | "number" | "boolean" | "enum";

export interface TemplateVariable {
  /** Environment variable name injected into the container, e.g. SERVER_VERSION */
  key: string;
  name: string;
  description: string;
  default: string;
  /** can the server owner see this value in the panel? */
  userViewable: boolean;
  /** can the server owner edit this value? */
  userEditable: boolean;
  type: VariableType;
  /** simple validation rules, pipe-separated: required|string|between:1,100 */
  rules: string;
  /** options for enum types (version pickers, server flavour, difficulty, ...) */
  options?: { value: string; label: string }[];
  /** group variables into sections in the UI */
  group?: string;
}

export interface PortSpec {
  /** human label, e.g. "Game", "Query", "RCON" */
  name: string;
  protocol: "tcp" | "udp" | "both";
  /** preferred HOST port (where auto-allocation starts looking for a free port) */
  default: number;
  /** environment variable that should receive the assigned port */
  envVar?: string;
  /** the port players actually connect to */
  primary?: boolean;
  /** offset from the primary port when auto-allocating (e.g. RCON = primary+? ) */
  offsetFromPrimary?: number;
  /**
   * Fixed port the image LISTENS on inside the container, when it can't be
   * changed (e.g. nginx/apache on 80). The daemon then maps host:<allocated> →
   * container:<containerPort>. Omit for images told their port via `envVar`
   * (they listen on the allocated port directly).
   */
  containerPort?: number;
}

export interface InstallScript {
  /** container image used to run the one-time install (often a thin tools image) */
  image: string;
  entrypoint: string;
  /** shell script; receives the same env as the server plus INSTALL markers */
  script: string;
}

/** Declarative parser for a config file so the panel can expose nice toggles. */
export interface ConfigFileSpec {
  path: string;
  parser: "properties" | "ini" | "yaml" | "json" | "env";
  /** field -> default; surfaced as editable settings */
  fields?: Record<string, { label: string; default: string; type?: VariableType; options?: string[] }>;
}

export interface GameTemplate {
  /** stable id, e.g. "minecraft-java" */
  id: string;
  /** game family, e.g. "minecraft", "icarus" */
  game: string;
  name: string;
  tagline: string;
  description: string;
  author: string;
  /** emoji or icon url shown in the catalog */
  icon: string;
  /** accent colour for cards / theming, hex */
  color: string;
  category: "minecraft" | "survival" | "sandbox" | "shooter" | "other" | "database" | "web" | "app";

  /** selectable docker images: label -> image ref (e.g. java versions) */
  dockerImages: Record<string, string>;
  defaultImage: string;

  /**
   * Startup command run inside the container. Supports {{VAR}} interpolation
   * from the resolved environment. For images with their own entrypoint
   * (like itzg/minecraft-server) this may be empty.
   */
  startupCommand: string;
  /** how to gracefully stop: a console command (e.g. "stop") or "^SIGTERM" */
  stopCommand: string;
  /** OS signal used as fallback / for kill */
  stopSignal: string;
  /** regex against console output that means "server fully started" */
  startupDoneRegex?: string;

  variables: TemplateVariable[];
  ports: PortSpec[];
  install: InstallScript;
  configFiles?: ConfigFileSpec[];

  /** sensible resource defaults (the panel/plan can override) */
  resources: { memoryMb: number; cpuPercent: number; diskMb: number };

  /** capability flags consumed by the UI/daemon */
  features: TemplateFeature[];

  /** if the game speaks RCON, how to reach it */
  rcon?: { envPort: string; envPassword: string; defaultPort: number };

  /** docs link surfaced in the panel */
  docsUrl?: string;

  /** primary persistent data path inside the container (bind-mounted by the daemon) */
  dataPath?: string;
}

export type TemplateFeature =
  | "rcon" // supports RCON command channel
  | "query" // supports server query (player counts)
  | "eula" // requires EULA acceptance
  | "plugins" // supports plugins (Bukkit/Spigot/Paper)
  | "mods" // supports mods (Fabric/Forge/NeoForge)
  | "modpacks" // one-click modpacks (Modrinth/CurseForge)
  | "console-input" // console accepts typed commands
  | "steamcmd" // installed via SteamCMD
  | "wine" // runs a Windows binary under Wine/Proton
  | "auto-pause" // can sleep when empty (lazymc-style)
  | "world-upload" // supports uploading an existing world/save
  | "workshop" // Steam Workshop addons & maps (Garry's Mod / Source)
  | "database" // a managed database server (show connection details)
  | "web"; // serves HTTP — the panel can surface a "Visit site" link / domain
