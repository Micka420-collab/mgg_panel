import type { GameTemplate } from "./template.js";

/**
 * GARRY'S MOD — Source-engine dedicated server (Steam AppID 4020).
 * GMod ships a native Linux dedicated server, downloaded and kept up to date via
 * SteamCMD inside ich777's gameserver image. Everything srcds needs — gamemode,
 * starting map, slot count, Workshop collection, GSLT and RCON — is passed on the
 * launch line through GAME_PARAMS. Add-ons, maps and saves live under
 * /serverdata/serverfiles, which Aether bind-mounts and persists.
 */
export const garrysmod: GameTemplate = {
  id: "garrysmod-dedicated",
  game: "garrysmod",
  name: "Garry's Mod: Dedicated Server",
  tagline: "Sandbox, DarkRP, TTT, Prop Hunt — your physics playground",
  description:
    "Host a Garry's Mod dedicated server with any gamemode (Sandbox, DarkRP, Trouble in Terrorist Town, Prop Hunt, ZombieSurvival...), Steam Workshop add-on collections and live updates. Runs the native Linux srcds binary, downloaded and kept current via SteamCMD — fully managed by Aether, no Steam client required.",
  author: "Aether",
  icon: "🔫",
  color: "#E8A33D",
  category: "sandbox",
  dockerImages: {
    "SteamCMD (ich777, GHCR)": "ghcr.io/ich777/steamcmd:garrysmod",
    "SteamCMD (ich777, Docker Hub)": "ich777/steamcmd:garrysmod",
  },
  defaultImage: "ghcr.io/ich777/steamcmd:garrysmod",
  // The image entrypoint runs SteamCMD + srcds itself; Aether only supplies env.
  startupCommand: "",
  // srcds shuts down cleanly on SIGTERM (the ich777 wrapper forwards it to srcds).
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex:
    "VAC secure mode is activated|gameserver logged on to Steam|Connection to Steam servers successful",
  docsUrl: "https://github.com/ich777/docker-steamcmd-server",
  dataPath: "/serverdata/serverfiles",
  resources: { memoryMb: 4096, cpuPercent: 200, diskMb: 16384 },
  features: ["steamcmd", "query", "mods", "world-upload"],
  ports: [
    // Source uses one UDP port for gameplay AND A2S query/join. The image binds
    // RCON (TCP, same number) internally on GAME_PORT.
    { name: "Game", protocol: "udp", default: 27015, envVar: "GAME_PORT", primary: true },
  ],
  variables: [
    {
      key: "GAME_PARAMS",
      name: "Launch parameters",
      description:
        "srcds command-line flags — this is where you set the gamemode, map and slots, e.g. \"+gamemode darkrp +map rp_downtown_v4c_v2 +maxplayers 32\". Common gamemodes: sandbox, darkrp, terrortown (TTT), prop_hunt, zombiesurvival. Add \"+host_workshop_collection <id>\" for a Workshop add-on collection, \"+hostname 'My Server'\" to name it in the browser, \"+rcon_password <pwd>\" to enable RCON, and \"+sv_setsteamaccount <GSLT>\" to list the server publicly on the internet.",
      default: "-secure +maxplayers 16 +gamemode sandbox +map gm_construct",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "required|string",
      group: "Server",
    },
    {
      key: "VALIDATE",
      name: "Validate files on update",
      description:
        "Run a SteamCMD integrity check on every boot/update. Slower, but repairs corrupted game files. Leave on \"No\" for fast restarts.",
      default: "",
      userViewable: true,
      userEditable: true,
      type: "enum",
      rules: "",
      options: [
        { value: "", label: "No" },
        { value: "true", label: "Yes" },
      ],
      group: "System",
    },
    // System variables — select the game for the generic ich777 SteamCMD image
    // and set the in-container user. Hidden from the server owner.
    {
      key: "GAME_ID",
      name: "Steam AppID",
      description: "Garry's Mod dedicated server AppID.",
      default: "4020",
      userViewable: false,
      userEditable: false,
      type: "string",
      rules: "required|string",
      group: "System",
    },
    {
      key: "GAME_NAME",
      name: "Game name",
      description: "ich777 image game folder.",
      default: "garrysmod",
      userViewable: false,
      userEditable: false,
      type: "string",
      rules: "required|string",
      group: "System",
    },
    {
      key: "UID",
      name: "Container UID",
      description: "User id the server process runs as.",
      default: "99",
      userViewable: false,
      userEditable: false,
      type: "number",
      rules: "integer",
      group: "System",
    },
    {
      key: "GID",
      name: "Container GID",
      description: "Group id the server process runs as.",
      default: "100",
      userViewable: false,
      userEditable: false,
      type: "number",
      rules: "integer",
      group: "System",
    },
  ],
  install: {
    // First boot downloads GMod via SteamCMD (AppID 4020) into serverfiles.
    image: "ghcr.io/ich777/steamcmd:garrysmod",
    entrypoint: "bash",
    script:
      '#!/bin/bash\necho "[Aether] Garry\'s Mod will download via SteamCMD (AppID 4020) on first boot."\necho "[Aether] The initial download is a few GB and can take several minutes."\n',
  },
};
