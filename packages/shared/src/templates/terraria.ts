import type { GameTemplate } from "./template.js";

/**
 * TERRARIA — vanilla dedicated server.
 *
 * Runs the official TerrariaServer inside the env-driven `passivelemon/terraria`
 * image. Every setting (world name/size, difficulty, slots, password, MOTD, seed)
 * is supplied as an environment variable which the image writes into
 * serverconfig.txt on each boot — so MGG drives it purely with env, no launch
 * args (the image's entrypoint builds the command itself).
 *
 * The world is auto-created on first boot (AUTOCREATE = size) and reloaded after.
 * Worlds + config live under /opt/terraria/config, which MGG bind-mounts and
 * persists. The image runs the server under tmux but tees its output to the
 * container log, so the panel console shows live server output; a clean SIGTERM
 * makes it announce, save and exit. Console output is read-only here (vanilla
 * Terraria has no RCON) — for in-game admin commands use a TShock image instead.
 */
export const terraria: GameTemplate = {
  id: "terraria-dedicated",
  game: "terraria",
  name: "Terraria: Dedicated Server",
  tagline: "Dig, fight, build — 2D sandbox adventure",
  description:
    "Host a Terraria dedicated server. The world is auto-created on first boot from your chosen size, difficulty and seed, then reloaded on every restart. Supports an optional join password, configurable slots and world uploads. Powered by the env-driven passivelemon/terraria image.",
  author: "MGG",
  icon: "🌳",
  color: "#7DBE3C",
  category: "sandbox",
  dockerImages: { "Vanilla (passivelemon)": "passivelemon/terraria-docker:latest" },
  defaultImage: "passivelemon/terraria-docker:latest",
  // The image entrypoint reads env -> serverconfig.txt and runs the server itself.
  startupCommand: "",
  // The image traps SIGTERM: it announces, saves the world and exits cleanly.
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Server started|Listening on port|Type 'help'",
  docsUrl: "https://github.com/PassiveLemon/terraria-docker",
  dataPath: "/opt/terraria/config",
  resources: { memoryMb: 2048, cpuPercent: 150, diskMb: 4096 },
  features: ["world-upload"],
  ports: [
    { name: "Game", protocol: "tcp", default: 7777, envVar: "PORT", primary: true },
  ],
  variables: [
    {
      key: "WORLDNAME",
      name: "World name",
      description: "Name of the world file (and the in-game world).",
      default: "MGGWorld",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "required|string",
      group: "World",
    },
    {
      key: "AUTOCREATE",
      name: "World size",
      description: "Size used when the world is first created: 1 = Small, 2 = Medium, 3 = Large.",
      default: "2",
      userViewable: true,
      userEditable: true,
      type: "enum",
      rules: "required|string",
      group: "World",
      options: [
        { value: "1", label: "Small" },
        { value: "2", label: "Medium" },
        { value: "3", label: "Large" },
      ],
    },
    {
      key: "DIFFICULTY",
      name: "Difficulty",
      description: "0 = Classic, 1 = Expert, 2 = Master, 3 = Journey. Only used when first creating the world.",
      default: "0",
      userViewable: true,
      userEditable: true,
      type: "enum",
      rules: "required|string",
      group: "World",
      options: [
        { value: "0", label: "Classic" },
        { value: "1", label: "Expert" },
        { value: "2", label: "Master" },
        { value: "3", label: "Journey" },
      ],
    },
    {
      key: "SEED",
      name: "World seed",
      description: "Optional generation seed (blank = random). Only used when first creating the world.",
      default: "",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "string",
      group: "World",
    },
    {
      key: "MAXPLAYERS",
      name: "Max players",
      description: "Slot count (Terraria supports up to 255; 8–16 is typical).",
      default: "8",
      userViewable: true,
      userEditable: true,
      type: "number",
      rules: "integer|between:1,255",
      group: "World",
    },
    {
      key: "PASSWORD",
      name: "Join password",
      description: "Leave blank for an open server.",
      default: "",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "string",
      group: "Access",
    },
    {
      key: "MOTD",
      name: "Message of the day",
      description: "Shown to players on join.",
      default: "Welcome to MGG Terraria",
      userViewable: true,
      userEditable: true,
      type: "string",
      rules: "string",
      group: "World",
    },
  ],
  install: {
    image: "passivelemon/terraria-docker:latest",
    entrypoint: "bash",
    script: '#!/bin/bash\necho "[MGG] Terraria creates the world on first boot (size: $AUTOCREATE, difficulty: $DIFFICULTY)."\n',
  },
};
