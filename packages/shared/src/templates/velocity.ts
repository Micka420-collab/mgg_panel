import type { GameTemplate } from "./template.js";

/**
 * Velocity — the modern Minecraft proxy.
 *
 * Velocity sits in front of several backend Minecraft (Java) servers and exposes
 * them as a single network address: players connect to the proxy, which routes
 * them to a backend (lobby/survival/creative/...) and lets them switch between
 * servers without disconnecting. This is the standard way to build a Minecraft
 * "network".
 *
 * We run it on the battle-tested `itzg/minecraft-server` image with
 * `TYPE=VELOCITY`, which downloads the chosen Velocity build on first boot and
 * generates a `velocity.toml` at the data root (`/data/velocity.toml`). The
 * panel's Proxy tab edits that file's `[servers]` table, the `try` order and the
 * `[forced-hosts]` section to manage the backend list — no manual file editing.
 *
 * IMPORTANT: backends a Velocity proxy fronts should run with `ONLINE_MODE=FALSE`
 * (offline) and player-info-forwarding configured, with the proxy itself doing
 * the Mojang auth. The panel surfaces this guidance in the UI.
 */
export const velocityProxy: GameTemplate = {
  id: "velocity-proxy",
  game: "velocity",
  name: "Velocity: Proxy Network",
  tagline: "One address for many Minecraft servers",
  description:
    "Run a Velocity proxy in front of your Minecraft Java servers so they form a single network players join through one address. Manage the backend server list, the default/try order and forced-hosts straight from the panel. Powered by the itzg image (TYPE=VELOCITY) which self-provisions Velocity on first boot.",
  author: "MGG",
  icon: "🛰️",
  color: "#1A95E0",
  category: "minecraft",
  dockerImages: {
    "Latest (newest MC · Java 25)": "itzg/minecraft-server:latest",
    "Java 21 (1.20.5–1.21.x)": "itzg/minecraft-server:java21",
    "Java 17 (1.17–1.20.4)": "itzg/minecraft-server:java17",
  },
  defaultImage: "itzg/minecraft-server:latest",
  // The itzg image has its own smart entrypoint; TYPE=VELOCITY drives it.
  startupCommand: "",
  // Velocity's console accepts "end" / "shutdown"; the itzg wrapper also traps
  // SIGTERM for a clean stop.
  stopCommand: "end",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Done \\(|Listening on /",
  docsUrl: "https://docs.papermc.io/velocity/",
  dataPath: "/data",
  resources: { memoryMb: 1024, cpuPercent: 150, diskMb: 4096 },
  features: ["console-input"],
  ports: [
    { name: "Game", protocol: "tcp", default: 25577, envVar: "SERVER_PORT", primary: true },
  ],
  variables: [
    {
      key: "TYPE",
      name: "Proxy software",
      description: "Velocity is the modern, recommended Minecraft proxy.",
      default: "VELOCITY",
      userViewable: true,
      userEditable: false,
      type: "enum",
      rules: "required|string",
      group: "General",
      options: [{ value: "VELOCITY", label: "Velocity (modern proxy)" }],
    },
    {
      key: "VELOCITY_VERSION",
      name: "Velocity version",
      description: 'Velocity build, e.g. "3.3.0-SNAPSHOT", or LATEST.',
      default: "LATEST",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "required|string",
      group: "General",
    },
    {
      key: "MOTD",
      name: "Message of the day",
      description: "Shown in the server list. Supports colour codes (&/§) and MiniMessage.",
      default: "<#1A95E0>Powered by <bold>MGG</bold>",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "string",
      group: "Network",
    },
    {
      key: "MEMORY",
      name: "JVM heap override",
      description: "Leave blank to let MGG size the heap from your plan's RAM. Proxies are light; 512M–1G is plenty.",
      default: "",
      userViewable: false,
      userEditable: false,
      type: "string",
      rules: "string",
      group: "System",
    },
  ],
  install: {
    image: "itzg/minecraft-server:latest",
    entrypoint: "bash",
    script:
      '#!/bin/bash\necho "[MGG] Velocity self-provisions on first boot (TYPE=VELOCITY, version: $VELOCITY_VERSION)."\necho "[MGG] Add your backend Minecraft servers from the panel Proxy tab once it is running."\necho "[MGG] Install step complete."\n',
  },
  configFiles: [
    {
      path: "velocity.toml",
      parser: "yaml",
      fields: {
        "bind": { label: "Bind address", default: "0.0.0.0:25577" },
        "online-mode": { label: "Online mode (proxy authenticates)", default: "true", type: "boolean" },
        "player-info-forwarding-mode": { label: "Forwarding mode", default: "modern" },
      },
    },
  ],
};

/**
 * BungeeCord / Waterfall — the classic Minecraft proxy.
 *
 * The long-established way to link several Minecraft (Java) servers behind one
 * address. BungeeCord is the original; Waterfall is the higher-performance fork.
 * Both are driven by the purpose-built `itzg/bungeecord` image, which downloads
 * the chosen proxy build on first boot and generates `config.yml` at `/server`.
 *
 * Like Velocity, the backends a Bungee/Waterfall proxy fronts must run in OFFLINE
 * mode (ONLINE_MODE=FALSE) with IP-forwarding enabled, while the proxy itself does
 * the Mojang auth — otherwise players can be spoofed. The panel surfaces this.
 */
export const bungeeProxy: GameTemplate = {
  id: "bungeecord-proxy",
  game: "bungeecord",
  name: "BungeeCord / Waterfall: Proxy Network",
  tagline: "Link many Minecraft servers behind one address",
  description:
    "Run a BungeeCord or Waterfall proxy so several Minecraft Java servers form a single network players join through one address, switching servers without disconnecting. Powered by the itzg/bungeecord image which self-provisions the proxy on first boot. Tip: use Velocity for new networks — Bungee/Waterfall are best for older plugin ecosystems.",
  author: "MGG",
  icon: "🌐",
  color: "#D4AF37",
  category: "minecraft",
  dockerImages: {
    "itzg/bungeecord (latest)": "itzg/bungeecord:latest",
    "itzg/bungeecord (java17)": "itzg/bungeecord:java17",
  },
  defaultImage: "itzg/bungeecord:latest",
  // The itzg/bungeecord image has its own entrypoint; TYPE drives the flavour.
  startupCommand: "",
  // BungeeCord/Waterfall console accepts "end"; the wrapper also traps SIGTERM.
  stopCommand: "end",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Listening on /|Enabled BungeeCord|Listening on ",
  docsUrl: "https://github.com/itzg/docker-bungeecord",
  dataPath: "/server",
  resources: { memoryMb: 1024, cpuPercent: 150, diskMb: 4096 },
  features: ["console-input"],
  ports: [
    { name: "Game", protocol: "tcp", default: 25577, envVar: "SERVER_PORT", primary: true },
  ],
  variables: [
    {
      key: "TYPE",
      name: "Proxy software",
      description: "BungeeCord is the original; Waterfall is the optimised fork (recommended of the two).",
      default: "WATERFALL",
      userViewable: true,
      userEditable: true,
      type: "enum",
      rules: "required|string",
      group: "General",
      options: [
        { value: "WATERFALL", label: "Waterfall (optimised fork)" },
        { value: "BUNGEECORD", label: "BungeeCord (original)" },
        { value: "FLAMECORD", label: "FlameCord (hardened Waterfall)" },
      ],
    },
    {
      key: "BUNGEE_JAR_REVISION",
      name: "Proxy build / version",
      description: 'Build number or "latest" / "lastStable".',
      default: "latest",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "required|string",
      group: "General",
    },
    {
      key: "MEMORY",
      name: "JVM heap override",
      description: "Leave blank to let MGG size the heap from your plan's RAM. Proxies are light; 512M–1G is plenty.",
      default: "",
      userViewable: false,
      userEditable: false,
      type: "string",
      rules: "string",
      group: "System",
    },
  ],
  install: {
    image: "itzg/bungeecord:latest",
    entrypoint: "bash",
    script:
      '#!/bin/bash\necho "[MGG] BungeeCord/Waterfall self-provisions on first boot (TYPE=$TYPE)."\necho "[MGG] Add your backend servers in config.yml once it is running."\necho "[MGG] Install step complete."\n',
  },
  configFiles: [
    {
      path: "config.yml",
      parser: "yaml",
      fields: {
        "online_mode": { label: "Online mode (proxy authenticates)", default: "true", type: "boolean" },
        "ip_forward": { label: "IP forwarding to backends", default: "true", type: "boolean" },
        "player_limit": { label: "Player limit (-1 = unlimited)", default: "-1", type: "number" },
      },
    },
  ],
};
