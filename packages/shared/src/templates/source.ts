import type { GameTemplate } from "./template.js";

/**
 * Source-engine dedicated servers (Valve), installed and kept current via
 * SteamCMD inside the well-maintained cm2network images. Everything is driven by
 * SRCDS_* / CS2_* environment variables — hostname, slots, maps, RCON and the
 * optional Game Server Login Token (GSLT) that lists the server publicly.
 */

/**
 * TEAM FORTRESS 2 — Source dedicated server (Steam AppID 232250).
 * cm2network/tf2 downloads TF2 via SteamCMD on first boot. A GSLT (SRCDS_TOKEN)
 * is optional for LAN/dev but required to appear in the public server browser.
 */
export const teamFortress2: GameTemplate = {
  id: "tf2-dedicated",
  game: "tf2",
  name: "Team Fortress 2: Dedicated Server",
  tagline: "9 classes, endless hats — classic Source shooter",
  description:
    "Host a Team Fortress 2 dedicated server. Pick the starting map, slots, hostname and passwords; RCON is wired to the in-panel console. Add a GSLT (SRCDS_TOKEN) to list it publicly. Runs the native Linux srcds binary, downloaded via SteamCMD — fully managed by MGG, no Steam client needed.",
  author: "MGG",
  icon: "🧨",
  color: "#CF7336",
  category: "shooter",
  dockerImages: { "SteamCMD (cm2network)": "cm2network/tf2:latest" },
  defaultImage: "cm2network/tf2:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "VAC secure mode is activated|gameserver Steam ID|Connection to Steam servers successful",
  docsUrl: "https://hub.docker.com/r/cm2network/tf2",
  dataPath: "/home/steam/tf-dedicated",
  rcon: { envPort: "SRCDS_PORT", envPassword: "SRCDS_RCONPW", defaultPort: 27015 },
  resources: { memoryMb: 2048, cpuPercent: 200, diskMb: 24576 },
  features: ["steamcmd", "rcon", "query", "console-input"],
  ports: [
    { name: "Game", protocol: "udp", default: 27015, envVar: "SRCDS_PORT", primary: true },
    { name: "RCON", protocol: "tcp", default: 27015, offsetFromPrimary: 0 },
    { name: "SourceTV", protocol: "udp", default: 27020, envVar: "SRCDS_TV_PORT", offsetFromPrimary: 5 },
  ],
  variables: [
    { key: "SRCDS_HOSTNAME", name: "Server name", description: "Shown in the server browser.", default: "MGG Team Fortress 2", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "General" },
    { key: "SRCDS_STARTMAP", name: "Starting map", description: "Map loaded on boot, e.g. cp_dustbowl, pl_upward, ctf_2fort.", default: "cp_dustbowl", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "General" },
    { key: "SRCDS_MAXPLAYERS", name: "Max players", description: "Slot count.", default: "24", userViewable: true, userEditable: true, type: "number", rules: "integer|between:2,32", group: "General" },
    { key: "SRCDS_REGION", name: "Region", description: "0 US-East, 1 US-West, 3 South America, 4 Europe, 5 Asia, 7 Australia, 255 World.", default: "255", userViewable: true, userEditable: true, type: "string", rules: "string", group: "General" },
    { key: "SRCDS_PW", name: "Join password", description: "Leave blank for a public server.", default: "", userViewable: true, userEditable: true, type: "string", rules: "string", group: "Access" },
    { key: "SRCDS_RCONPW", name: "RCON password", description: "Remote console password. Auto-generated.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Access" },
    { key: "SRCDS_TOKEN", name: "GSLT (public listing token)", description: "Game Server Login Token from https://steamcommunity.com/dev/managegameservers — required to appear in the public browser. Leave blank for LAN/private.", default: "", userViewable: true, userEditable: true, type: "string", rules: "string", group: "Access" },
  ],
  install: {
    image: "cm2network/tf2:latest",
    entrypoint: "bash",
    script: '#!/bin/bash\necho "[MGG] Team Fortress 2 downloads via SteamCMD (AppID 232250) on first boot — a few GB."\n',
  },
};

/**
 * COUNTER-STRIKE 2 — Source 2 dedicated server (Steam AppID 730), the successor
 * to CS:GO. cm2network/cs2 downloads CS2 via SteamCMD on first boot.
 * NOTE: CS2 REQUIRES a GSLT (SRCDS_TOKEN) to start a public server.
 */
export const counterStrike2: GameTemplate = {
  id: "cs2-dedicated",
  game: "cs2",
  name: "Counter-Strike 2: Dedicated Server",
  tagline: "Competitive 5v5 — the CS:GO successor",
  description:
    "Host a Counter-Strike 2 dedicated server (the free successor to CS:GO). Choose the game mode, map group, slots and passwords; RCON is wired to the in-panel console. NOTE: CS2 requires a GSLT (SRCDS_TOKEN) to run — generate one at steamcommunity.com/dev/managegameservers. Installed and updated via SteamCMD, fully managed by MGG.",
  author: "MGG",
  icon: "💣",
  color: "#F0A732",
  category: "shooter",
  dockerImages: { "SteamCMD (cm2network)": "cm2network/cs2:latest" },
  defaultImage: "cm2network/cs2:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "VAC secure mode is activated|Connection to Steam servers successful|GC Connection established",
  docsUrl: "https://hub.docker.com/r/cm2network/cs2",
  dataPath: "/home/steam/cs2-dedicated",
  rcon: { envPort: "CS2_PORT", envPassword: "CS2_RCONPW", defaultPort: 27015 },
  resources: { memoryMb: 4096, cpuPercent: 300, diskMb: 49152 },
  features: ["steamcmd", "rcon", "query", "console-input"],
  ports: [
    { name: "Game", protocol: "udp", default: 27015, envVar: "CS2_PORT", primary: true },
    { name: "RCON", protocol: "tcp", default: 27015, offsetFromPrimary: 0 },
  ],
  variables: [
    { key: "SRCDS_TOKEN", name: "GSLT (required)", description: "Game Server Login Token from https://steamcommunity.com/dev/managegameservers — CS2 will not start a server without it.", default: "", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Access" },
    { key: "CS2_SERVERNAME", name: "Server name", description: "Shown in the server browser.", default: "MGG Counter-Strike 2", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "General" },
    { key: "CS2_MAXPLAYERS", name: "Max players", description: "Slot count.", default: "10", userViewable: true, userEditable: true, type: "number", rules: "integer|between:2,64", group: "General" },
    {
      key: "CS2_GAMEALIAS",
      name: "Game mode",
      description: "Server game mode preset.",
      default: "competitive",
      userViewable: true,
      userEditable: true,
      type: "enum",
      rules: "string",
      group: "General",
      options: [
        { value: "competitive", label: "Competitive" },
        { value: "casual", label: "Casual" },
        { value: "wingman", label: "Wingman (2v2)" },
        { value: "deathmatch", label: "Deathmatch" },
        { value: "custom", label: "Custom" },
      ],
    },
    { key: "CS2_MAPGROUP", name: "Map group", description: "Map rotation pool, e.g. mg_active, mg_comp, mg_casual.", default: "mg_active", userViewable: true, userEditable: true, type: "string", rules: "string", group: "General" },
    { key: "CS2_STARTMAP", name: "Starting map", description: "Map loaded on boot, e.g. de_inferno, de_mirage, de_dust2.", default: "de_inferno", userViewable: true, userEditable: true, type: "string", rules: "string", group: "General" },
    { key: "CS2_PW", name: "Join password", description: "Leave blank for a public server.", default: "", userViewable: true, userEditable: true, type: "string", rules: "string", group: "Access" },
    { key: "CS2_RCONPW", name: "RCON password", description: "Remote console password. Auto-generated.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Access" },
    { key: "CS2_LAN", name: "LAN mode", description: "Set to 1 for a LAN-only server (no GSLT required).", default: "0", userViewable: true, userEditable: true, type: "boolean", rules: "boolean", group: "Access" },
  ],
  install: {
    image: "cm2network/cs2:latest",
    entrypoint: "bash",
    script: '#!/bin/bash\necho "[MGG] Counter-Strike 2 downloads via SteamCMD (AppID 730) on first boot — ~30 GB, can take a while."\necho "[MGG] Remember: CS2 needs a GSLT (SRCDS_TOKEN) to run a public server."\n',
  },
};
