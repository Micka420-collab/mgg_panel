import type { GameTemplate } from "./template.js";

/**
 * Voice servers — not games, but the rest of the community stack. Both run from
 * their official images and are pure "data" templates like every other.
 */

/**
 * TEAMSPEAK 3 — the classic dedicated voice server (official `teamspeak` image).
 *
 * Requires accepting the TeamSpeak license (TS3SERVER_LICENSE=accept) to boot.
 * IMPORTANT: on the VERY FIRST boot the server prints a one-time ServerAdmin
 * privilege key ("token=...") and the ServerQuery admin login/password to the
 * console — grab them from the panel console to claim admin in your TS client.
 */
export const teamspeak: GameTemplate = {
  id: "teamspeak3-server",
  game: "teamspeak",
  name: "TeamSpeak 3: Voice Server",
  tagline: "Low-latency voice for your community",
  description:
    "Host a TeamSpeak 3 voice server (official image). On first boot the console shows a one-time admin token and the ServerQuery credentials — copy them from the panel console to claim admin rights. The free license allows up to 32 slots.",
  author: "MGG",
  icon: "🎧",
  color: "#2580C3",
  category: "other",
  dockerImages: { "Official (latest)": "teamspeak:latest" },
  defaultImage: "teamspeak:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "listening on 0\\.0\\.0\\.0:|Puzzle solution",
  docsUrl: "https://hub.docker.com/_/teamspeak",
  dataPath: "/var/ts3server",
  resources: { memoryMb: 1024, cpuPercent: 100, diskMb: 2048 },
  features: ["query"],
  ports: [
    { name: "Voice", protocol: "udp", default: 9987, envVar: "TS3SERVER_DEFAULT_VOICE_PORT", primary: true },
    { name: "ServerQuery", protocol: "tcp", default: 10011, envVar: "TS3SERVER_QUERY_PORT", offsetFromPrimary: 24 },
    { name: "File transfer", protocol: "tcp", default: 30033, envVar: "TS3SERVER_FILETRANSFER_PORT", offsetFromPrimary: 20046 },
  ],
  variables: [
    {
      key: "TS3SERVER_LICENSE",
      name: "Accept the TeamSpeak license",
      description: "You must accept the TeamSpeak license agreement to run a server.",
      default: "accept",
      userViewable: true,
      userEditable: true,
      type: "enum",
      rules: "required|string",
      group: "General",
      options: [
        { value: "accept", label: "Accept" },
        { value: "", label: "Not accepted" },
      ],
    },
    {
      key: "TS3SERVER_QUERY_PROTOCOLS",
      name: "ServerQuery protocols",
      description: "Allowed ServerQuery protocols (raw, ssh or both).",
      default: "raw,ssh",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "string",
      group: "Advanced",
    },
  ],
  install: {
    image: "teamspeak:latest",
    entrypoint: "bash",
    script: '#!/bin/bash\necho "[MGG] TeamSpeak prints a one-time admin token to the console on first boot — keep it."\n',
  },
};

/**
 * MUMBLE (Murmur) — open-source, very low-latency voice server
 * (official `mumblevoip/mumble-server` image). Configure via MUMBLE_CONFIG_*
 * env vars, which map straight onto murmur.ini keys.
 */
export const mumble: GameTemplate = {
  id: "mumble-server",
  game: "mumble",
  name: "Mumble: Voice Server",
  tagline: "Open-source, ultra-low-latency voice",
  description:
    "Host a Mumble (Murmur) voice server — open source, encrypted and famous for its low latency. Set the SuperUser password to administer it from the Mumble client, plus an optional join password, slot limit and welcome text. Powered by the official mumble-server image.",
  author: "MGG",
  icon: "🎙️",
  color: "#CC8800",
  category: "other",
  dockerImages: { "Official (latest)": "mumblevoip/mumble-server:latest" },
  defaultImage: "mumblevoip/mumble-server:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Server listening on|Murmur.*running",
  docsUrl: "https://hub.docker.com/r/mumblevoip/mumble-server",
  dataPath: "/data",
  resources: { memoryMb: 512, cpuPercent: 100, diskMb: 1024 },
  features: [],
  ports: [
    { name: "Voice/Control", protocol: "both", default: 64738, envVar: "SERVER_PORT", primary: true },
  ],
  variables: [
    {
      key: "MUMBLE_SUPERUSER_PASSWORD",
      name: "SuperUser password",
      description: "Password for the built-in SuperUser admin account. Auto-generated; keep it secret.",
      default: "{{RANDOM}}",
      userViewable: true,
      userEditable: false,
      type: "string",
      rules: "required|string",
      group: "Access",
    },
    {
      key: "MUMBLE_CONFIG_serverpassword",
      name: "Join password",
      description: "Password players need to connect. Leave blank for an open server.",
      default: "",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "string",
      group: "Access",
    },
    {
      key: "MUMBLE_CONFIG_users",
      name: "Max users",
      description: "Maximum simultaneous connected users.",
      default: "100",
      userViewable: true,
      userEditable: true,
      type: "number",
      rules: "integer|between:1,1000",
      group: "General",
    },
    {
      key: "MUMBLE_CONFIG_welcometext",
      name: "Welcome message",
      description: "Shown to clients when they connect (supports basic HTML).",
      default: "Welcome to the MGG Mumble server.",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "string",
      group: "General",
    },
  ],
  install: {
    image: "mumblevoip/mumble-server:latest",
    entrypoint: "bash",
    script: '#!/bin/bash\necho "[MGG] Mumble is ready on first boot. Use SuperUser + the password above to administer it."\n',
  },
};
