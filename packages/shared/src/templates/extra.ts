import type { GameTemplate } from "./template.js";

/**
 * Bonus templates that showcase MGG's generic engine: each is "just data".
 * Add a new game by writing one of these — no daemon or panel changes needed.
 */

export const valheim: GameTemplate = {
  id: "valheim-dedicated",
  game: "valheim",
  name: "Valheim: Dedicated Server",
  tagline: "Conquer the tenth Norse world with friends",
  description: "A managed Valheim dedicated server with automatic updates, BepInEx mod support and world backups.",
  author: "MGG",
  icon: "🛡️",
  color: "#4C7FB8",
  category: "survival",
  dockerImages: { "SteamCMD (lloesche)": "lloesche/valheim-server:latest" },
  defaultImage: "lloesche/valheim-server:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Game server connected|Done generating",
  dataPath: "/config",
  resources: { memoryMb: 4096, cpuPercent: 200, diskMb: 8192 },
  features: ["steamcmd", "query", "mods", "world-upload"],
  ports: [
    { name: "Game", protocol: "udp", default: 2456, envVar: "SERVER_PORT", primary: true },
    { name: "Game+1", protocol: "udp", default: 2457, offsetFromPrimary: 1 },
  ],
  variables: [
    { key: "SERVER_NAME", name: "Server name", description: "Public name.", default: "MGG Valheim", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "General" },
    { key: "WORLD_NAME", name: "World name", description: "World save name.", default: "Midgard", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "General" },
    { key: "SERVER_PASS", name: "Server password", description: "Min 5 chars, required by Valheim.", default: "mgg123", userViewable: true, userEditable: true, type: "string", rules: "required|string|min:5", group: "Access" },
    { key: "SERVER_PUBLIC", name: "List publicly", description: "Show in the community server browser.", default: "1", userViewable: true, userEditable: true, type: "boolean", rules: "boolean", group: "Access" },
  ],
  install: { image: "lloesche/valheim-server:latest", entrypoint: "bash", script: '#!/bin/bash\necho "[MGG] Valheim downloads via SteamCMD on first boot."\n' },
};

export const palworld: GameTemplate = {
  id: "palworld-dedicated",
  game: "palworld",
  name: "Palworld: Dedicated Server",
  tagline: "Catch, build and battle Pals together",
  description: "Managed Palworld dedicated server with RCON, configurable rates and auto-updates.",
  author: "MGG",
  icon: "🐾",
  color: "#2FB7C3",
  category: "survival",
  dockerImages: { "SteamCMD (thijsvanloef)": "thijsvanloef/palworld-server-docker:latest" },
  defaultImage: "thijsvanloef/palworld-server-docker:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Setting breakpad|Running Palworld",
  dataPath: "/palworld",
  rcon: { envPort: "RCON_PORT", envPassword: "ADMIN_PASSWORD", defaultPort: 25575 },
  resources: { memoryMb: 8192, cpuPercent: 400, diskMb: 16384 },
  features: ["steamcmd", "rcon", "query", "console-input"],
  ports: [
    { name: "Game", protocol: "udp", default: 8211, envVar: "PORT", primary: true },
    { name: "RCON", protocol: "tcp", default: 25575, envVar: "RCON_PORT", offsetFromPrimary: 17364 },
  ],
  variables: [
    { key: "SERVER_NAME", name: "Server name", description: "Public name.", default: "MGG Palworld", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "General" },
    { key: "PLAYERS", name: "Max players", description: "Up to 32.", default: "16", userViewable: true, userEditable: true, type: "number", rules: "integer|between:1,32", group: "General" },
    { key: "SERVER_PASSWORD", name: "Server password", description: "Leave blank for open.", default: "", userViewable: true, userEditable: true, type: "string", rules: "string", group: "Access" },
    { key: "ADMIN_PASSWORD", name: "Admin / RCON password", description: "Auto-generated.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Access" },
    { key: "RCON_ENABLED", name: "Enable RCON", description: "Required for the in-panel console.", default: "true", userViewable: false, userEditable: false, type: "boolean", rules: "boolean", group: "System" },
  ],
  install: { image: "thijsvanloef/palworld-server-docker:latest", entrypoint: "bash", script: '#!/bin/bash\necho "[MGG] Palworld downloads via SteamCMD on first boot."\n' },
};

export const rust: GameTemplate = {
  id: "rust-dedicated",
  game: "rust",
  name: "Rust: Dedicated Server",
  tagline: "Survive, raid and dominate the island",
  description: "Managed Rust dedicated server with Oxide/Carbon mod support, RCON and scheduled wipes.",
  author: "MGG",
  icon: "🔧",
  color: "#CD412B",
  category: "survival",
  dockerImages: { "SteamCMD (didstopia)": "didstopia/rust-server:latest" },
  defaultImage: "didstopia/rust-server:latest",
  startupCommand: "",
  stopCommand: "quit",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Server startup complete|SteamServer Initialized",
  dataPath: "/steamcmd/rust",
  rcon: { envPort: "RUST_RCON_PORT", envPassword: "RUST_RCON_PASSWORD", defaultPort: 28016 },
  resources: { memoryMb: 8192, cpuPercent: 400, diskMb: 24576 },
  features: ["steamcmd", "rcon", "query", "mods", "console-input"],
  ports: [
    { name: "Game", protocol: "udp", default: 28015, envVar: "RUST_SERVER_PORT", primary: true },
    { name: "RCON", protocol: "tcp", default: 28016, envVar: "RUST_RCON_PORT", offsetFromPrimary: 1 },
    { name: "Query", protocol: "udp", default: 28017, envVar: "RUST_SERVER_QUERYPORT", offsetFromPrimary: 2 },
  ],
  variables: [
    { key: "RUST_SERVER_NAME", name: "Server name", description: "Public name.", default: "MGG Rust", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "General" },
    { key: "RUST_SERVER_MAXPLAYERS", name: "Max players", description: "Slot count.", default: "50", userViewable: true, userEditable: true, type: "number", rules: "integer|between:1,500", group: "General" },
    { key: "RUST_SERVER_WORLDSIZE", name: "World size", description: "Map size (1000-6000).", default: "3500", userViewable: true, userEditable: true, type: "number", rules: "integer|between:1000,6000", group: "World" },
    { key: "RUST_SERVER_SEED", name: "Map seed", description: "Procedural map seed.", default: "12345", userViewable: true, userEditable: true, type: "number", rules: "integer", group: "World" },
    { key: "RUST_RCON_PASSWORD", name: "RCON password", description: "Auto-generated.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "System" },
  ],
  install: { image: "didstopia/rust-server:latest", entrypoint: "bash", script: '#!/bin/bash\necho "[MGG] Rust downloads via SteamCMD on first boot."\n' },
};
