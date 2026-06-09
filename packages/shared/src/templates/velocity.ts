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
