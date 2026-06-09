import type { GameTemplate } from "./template.js";

/**
 * GTA V — FiveM Roleplay (FXServer + txAdmin).
 *
 * FiveM is the de-facto platform for GTA V roleplay. We run the official
 * FXServer through the `traskin/fxserver` image, which boots **txAdmin** (FiveM's
 * web admin panel) on first start — so the whole server is set up from a browser:
 * paste your free cfx.re license key, then one-click-deploy a roleplay base
 * (ESX, QBox/QBCore or a vanilla freeroam) with the Recipe Deployer.
 *
 * All persistent state (txAdmin profile, admins, deployed server-data/resources)
 * lives under a single directory, `/txData`, which Aether bind-mounts — matching
 * the daemon's one-volume model. The server is driven entirely from txAdmin, so
 * there is no in-panel RCON console here; use the txAdmin live console instead.
 *
 * Note: ESX/QBCore roleplay frameworks need a MySQL/MariaDB database — you supply
 * its host/credentials in the txAdmin recipe step (run one alongside, e.g. another
 * managed DB, or an external MariaDB).
 */
export const fivem: GameTemplate = {
  id: "fivem-rp",
  game: "fivem",
  name: "GTA V: FiveM Roleplay",
  tagline: "Spin up a GTA 5 RP server with txAdmin in minutes",
  description:
    "Host a GTA V roleplay server on FiveM (FXServer). Boots txAdmin — the FiveM web admin panel — on first start, so setup is point-and-click: open txAdmin, enter your free cfx.re license key, then deploy a roleplay base (ESX, QBox/QBCore or vanilla) in one click. " +
    "Getting started after deploy: (1) open this server's live console and copy the one-time txAdmin PIN; (2) browse to http://YOUR_SERVER_IP:40120 and enter the PIN to create your admin account; (3) in txAdmin paste your cfx.re key (free at keymaster.fivem.net) and run the Recipe Deployer; (4) players connect in the FiveM client to YOUR_SERVER_IP:30120. " +
    "ESX/QBCore frameworks require a MySQL/MariaDB database — provide its details during the recipe step.",
  author: "Aether",
  icon: "🚓",
  color: "#F0A500",
  category: "other",
  dockerImages: {
    "Recommended (txAdmin)": "traskin/fxserver:recommended",
    Latest: "traskin/fxserver:latest",
    "Optional (bleeding edge)": "traskin/fxserver:optional",
  },
  defaultImage: "traskin/fxserver:recommended",
  // The image's own entrypoint launches txAdmin; we don't override the command.
  startupCommand: "",
  // txAdmin traps SIGTERM and shuts the FXServer child down cleanly.
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  // Matches once the actual FiveM server is live (license validated / resources up),
  // or once txAdmin's webserver is listening. Tune if your build logs differ.
  startupDoneRegex:
    "Server license key authentication succeeded|Started resource|All ready|listening on .*:40120|txAdmin.*ready",
  docsUrl: "https://aka.cfx.re/txadmin-recipe",
  // Single persistent dir: txAdmin profile + admins + deployed server-data/resources.
  dataPath: "/txData",
  resources: { memoryMb: 4096, cpuPercent: 300, diskMb: 20480 },
  // No in-panel RCON (managed via txAdmin web console). Can import existing server-data.
  features: ["world-upload"],
  ports: [
    // Game port players connect to. FXServer's listen port is set in server.cfg
    // (via txAdmin); keep it equal to this allocation — the default 30120 works as-is.
    { name: "Game", protocol: "both", default: 30120, primary: true },
    // txAdmin web panel.
    { name: "txAdmin", protocol: "tcp", default: 40120, offsetFromPrimary: 10000 },
  ],
  variables: [
    {
      key: "LICENSE_KEY",
      name: "cfx.re license key (optional)",
      description:
        "Your free FiveM server key from https://keymaster.fivem.net. Optional here — you normally paste it inside txAdmin during the guided setup. Leave blank to set it later in txAdmin.",
      default: "",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "string",
      group: "FiveM",
    },
    {
      key: "TXADMIN_NOTE",
      name: "Setup happens in txAdmin",
      description:
        "After deploy, open the live console to read the one-time txAdmin PIN, then go to http://YOUR_SERVER_IP:40120 to finish setup. This field is informational.",
      default: "Open :40120 after deploy — PIN is in the console",
      userViewable: true,
      userEditable: false,
      type: "string",
      rules: "string",
      group: "FiveM",
    },
  ],
  install: {
    image: "traskin/fxserver:recommended",
    entrypoint: "bash",
    script:
      '#!/bin/bash\necho "[Aether] FiveM (FXServer) boots txAdmin on first start."\necho "[Aether] Finish setup at http://YOUR_SERVER_IP:40120 (PIN is printed in the console)."\n',
  },
};
