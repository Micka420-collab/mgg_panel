import type { GameTemplate } from "./template.js";

/**
 * 1-click self-hosted apps / SaaS. Standard official images, env-driven, plugged
 * into MGG's engine. Deploy in one click, then open the address from the Network
 * tab (point a domain at it for a clean URL).
 */

/** n8n — workflow automation (the open-source Zapier/Make alternative). */
export const n8n: GameTemplate = {
  id: "n8n",
  game: "n8n",
  name: "n8n: Automatisation (no-code)",
  tagline: "Alternative open-source à Zapier / Make",
  description:
    "Héberge n8n pour automatiser tes workflows (Discord, webhooks, APIs, bases de données…) sans code. Ouvre l'adresse de l'onglet Réseau pour accéder à l'éditeur. Pour de la production, branche une base PostgreSQL.",
  author: "MGG",
  icon: "🔗",
  color: "#EA4B71",
  category: "app",
  dockerImages: { "n8n (latest)": "n8nio/n8n:latest" },
  defaultImage: "n8nio/n8n:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Editor is now accessible|n8n ready on|Version:",
  docsUrl: "https://docs.n8n.io/hosting/",
  dataPath: "/home/node/.n8n",
  resources: { memoryMb: 1024, cpuPercent: 150, diskMb: 4096 },
  features: ["web"],
  ports: [{ name: "HTTP", protocol: "tcp", default: 5678, envVar: "N8N_PORT", primary: true }],
  variables: [
    { key: "GENERIC_TIMEZONE", name: "Fuseau horaire", description: "Pour les déclencheurs planifiés (cron).", default: "Europe/Paris", userViewable: true, userEditable: true, type: "string", rules: "string", group: "Général" },
    { key: "N8N_SECURE_COOKIE", name: "Cookie sécurisé (HTTPS)", description: "Mettre false pour accéder via http:// (IP/port sans HTTPS), true derrière un domaine HTTPS.", default: "false", userViewable: true, userEditable: true, type: "boolean", rules: "boolean", group: "Général" },
  ],
  install: { image: "n8nio/n8n:latest", entrypoint: "sh", script: '#!/bin/sh\necho "[MGG] n8n prêt — ouvre l\'adresse Réseau pour l\'éditeur."\n' },
};

/** Uptime Kuma — beautiful self-hosted uptime/status monitoring. */
export const uptimeKuma: GameTemplate = {
  id: "uptime-kuma",
  game: "uptime-kuma",
  name: "Uptime Kuma: Monitoring",
  tagline: "Surveille tes serveurs & sites (status page)",
  description:
    "Supervision auto-hébergée : surveille tes serveurs de jeu, sites et apps (ping, HTTP, port, ...) avec alertes Discord/Telegram et une jolie page de statut publique. Ouvre l'adresse de l'onglet Réseau pour la configurer.",
  author: "MGG",
  icon: "📈",
  color: "#5CDD8B",
  category: "app",
  dockerImages: { "Uptime Kuma 1": "louislam/uptime-kuma:1" },
  defaultImage: "louislam/uptime-kuma:1",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Listening on|Welcome to Uptime Kuma|Started Server",
  docsUrl: "https://github.com/louislam/uptime-kuma",
  dataPath: "/app/data",
  resources: { memoryMb: 512, cpuPercent: 100, diskMb: 2048 },
  features: ["web"],
  ports: [{ name: "HTTP", protocol: "tcp", default: 3001, envVar: "UPTIME_KUMA_PORT", primary: true }],
  variables: [],
  install: { image: "louislam/uptime-kuma:1", entrypoint: "sh", script: '#!/bin/sh\necho "[MGG] Uptime Kuma prêt — configure-le via l\'adresse Réseau."\n' },
};

/** Vaultwarden — lightweight self-hosted Bitwarden-compatible password manager. */
export const vaultwarden: GameTemplate = {
  id: "vaultwarden",
  game: "vaultwarden",
  name: "Vaultwarden: Mots de passe",
  tagline: "Gestionnaire de mots de passe (compatible Bitwarden)",
  description:
    "Ton propre coffre-fort de mots de passe, compatible avec les apps et extensions Bitwarden. Léger et complet. Définis un ADMIN_TOKEN pour accéder au panneau d'administration /admin.",
  author: "MGG",
  icon: "🔐",
  color: "#175DDC",
  category: "app",
  dockerImages: { "Vaultwarden (latest)": "vaultwarden/server:latest" },
  defaultImage: "vaultwarden/server:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Rocket has launched|Starting Rocket",
  docsUrl: "https://github.com/dani-garcia/vaultwarden/wiki",
  dataPath: "/data",
  resources: { memoryMb: 512, cpuPercent: 100, diskMb: 2048 },
  features: ["web"],
  // ROCKET_PORT makes Vaultwarden listen on the allocated host port (avoids 80).
  ports: [{ name: "HTTP", protocol: "tcp", default: 8083, envVar: "ROCKET_PORT", primary: true }],
  variables: [
    { key: "ADMIN_TOKEN", name: "Token admin (/admin)", description: "Mot de passe du panneau d'admin. Généré automatiquement.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "string", group: "Accès" },
    { key: "SIGNUPS_ALLOWED", name: "Inscriptions ouvertes", description: "Autoriser la création de comptes (mettre false après avoir créé le tien).", default: "true", userViewable: true, userEditable: true, type: "boolean", rules: "boolean", group: "Accès" },
  ],
  install: { image: "vaultwarden/server:latest", entrypoint: "sh", script: '#!/bin/sh\necho "[MGG] Vaultwarden prêt."\n' },
};

/** Nextcloud — self-hosted cloud (files, calendar, contacts). SQLite by default. */
export const nextcloud: GameTemplate = {
  id: "nextcloud",
  game: "nextcloud",
  name: "Nextcloud: Cloud privé",
  tagline: "Tes fichiers, agenda & contacts auto-hébergés",
  description:
    "Ton Google Drive privé : fichiers, partage, agenda, contacts, photos. Fonctionne en SQLite par défaut (zéro config) ; pour de gros usages, branche une base MySQL/MariaDB ou PostgreSQL. Ouvre l'adresse Réseau et crée ton compte admin.",
  author: "MGG",
  icon: "☁️",
  color: "#0082C9",
  category: "app",
  dockerImages: { "Nextcloud (Apache)": "nextcloud:apache", "Nextcloud (stable)": "nextcloud:stable-apache" },
  defaultImage: "nextcloud:apache",
  startupCommand: "",
  stopCommand: "^SIGWINCH",
  stopSignal: "SIGWINCH",
  startupDoneRegex: "apache2 -D FOREGROUND|resuming normal operations|Command line: 'apache2",
  docsUrl: "https://hub.docker.com/_/nextcloud",
  dataPath: "/var/www/html",
  resources: { memoryMb: 1024, cpuPercent: 150, diskMb: 16384 },
  features: ["web"],
  // Host 8082 (80 is the panel's); Apache listens on 80 inside the container.
  ports: [{ name: "HTTP", protocol: "tcp", default: 8082, containerPort: 80, primary: true }],
  variables: [
    { key: "NEXTCLOUD_ADMIN_USER", name: "Admin", description: "Nom du compte administrateur.", default: "admin", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Accès" },
    { key: "NEXTCLOUD_ADMIN_PASSWORD", name: "Mot de passe admin", description: "Généré automatiquement.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Accès" },
    { key: "NEXTCLOUD_TRUSTED_DOMAINS", name: "Domaines de confiance", description: "Adresse(s) autorisée(s) (IP:port ou domaine), séparées par des espaces.", default: "*", userViewable: true, userEditable: true, type: "string", rules: "string", group: "Accès" },
  ],
  install: { image: "nextcloud:apache", entrypoint: "bash", script: '#!/bin/bash\necho "[MGG] Nextcloud s\'installe au premier démarrage (SQLite par défaut)."\n' },
};
