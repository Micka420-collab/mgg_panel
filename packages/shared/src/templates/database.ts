import type { GameTemplate } from "./template.js";

/**
 * Managed databases — the "Hébergement" side of the catalog. Each is a standard
 * official image driven entirely by environment variables (no launch args), so it
 * plugs straight into MGG's engine: 1-click deploy, console/logs, file manager,
 * backups and the RAM manager. Credentials are surfaced in the server's settings
 * (userViewable) and the host:port in the Network tab — point a game plugin, a
 * website or an app at them.
 */

/** MySQL 8 — the most widely-supported relational database. */
export const mysql: GameTemplate = {
  id: "mysql-8",
  game: "mysql",
  name: "MySQL: Base de données",
  tagline: "Base SQL pour plugins, sites & apps",
  description:
    "Serveur MySQL 8 managé. Idéal pour les plugins Minecraft (LuckPerms, CoreProtect…), un site web ou une app. Le mot de passe root et un utilisateur dédié sont générés automatiquement et visibles dans les réglages ; l'adresse + le port sont dans l'onglet Réseau.",
  author: "MGG",
  icon: "🐬",
  color: "#00758F",
  category: "database",
  dockerImages: { "MySQL 8.4 LTS": "mysql:8.4", "MySQL 8.0": "mysql:8.0" },
  defaultImage: "mysql:8.4",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "ready for connections",
  docsUrl: "https://hub.docker.com/_/mysql",
  dataPath: "/var/lib/mysql",
  resources: { memoryMb: 1024, cpuPercent: 100, diskMb: 8192 },
  features: ["database"],
  // MYSQL_TCP_PORT makes mysqld listen on the allocated port (1:1 host↔container).
  ports: [{ name: "MySQL", protocol: "tcp", default: 3306, envVar: "MYSQL_TCP_PORT", primary: true }],
  variables: [
    { key: "MYSQL_ROOT_PASSWORD", name: "Mot de passe root", description: "Mot de passe du compte root. Généré automatiquement — gardez-le secret.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Accès" },
    { key: "MYSQL_DATABASE", name: "Base à créer", description: "Une base de données créée au premier démarrage.", default: "app", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Base" },
    { key: "MYSQL_USER", name: "Utilisateur", description: "Utilisateur dédié (droits sur la base ci-dessus).", default: "app", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Accès" },
    { key: "MYSQL_PASSWORD", name: "Mot de passe utilisateur", description: "Mot de passe de l'utilisateur dédié. Généré automatiquement.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Accès" },
  ],
  install: { image: "mysql:8.4", entrypoint: "bash", script: '#!/bin/bash\necho "[MGG] MySQL initialise la base au premier démarrage."\n' },
};

/** MariaDB 11 — drop-in MySQL fork, popular for game-server plugins. */
export const mariadb: GameTemplate = {
  id: "mariadb-11",
  game: "mariadb",
  name: "MariaDB: Base de données",
  tagline: "Fork MySQL rapide et open-source",
  description:
    "Serveur MariaDB 11 managé, compatible MySQL. Parfait pour les plugins Minecraft et les apps PHP. Identifiants générés automatiquement et visibles dans les réglages.",
  author: "MGG",
  icon: "🦭",
  color: "#C0765A",
  category: "database",
  dockerImages: { "MariaDB 11": "mariadb:11", "MariaDB 10.11 LTS": "mariadb:10.11" },
  defaultImage: "mariadb:11",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "ready for connections|mariadbd: ready for connections",
  docsUrl: "https://hub.docker.com/_/mariadb",
  dataPath: "/var/lib/mysql",
  resources: { memoryMb: 1024, cpuPercent: 100, diskMb: 8192 },
  features: ["database"],
  ports: [{ name: "MariaDB", protocol: "tcp", default: 3306, primary: true }],
  variables: [
    { key: "MARIADB_ROOT_PASSWORD", name: "Mot de passe root", description: "Mot de passe root. Généré automatiquement.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Accès" },
    { key: "MARIADB_DATABASE", name: "Base à créer", description: "Base créée au premier démarrage.", default: "app", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Base" },
    { key: "MARIADB_USER", name: "Utilisateur", description: "Utilisateur dédié.", default: "app", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Accès" },
    { key: "MARIADB_PASSWORD", name: "Mot de passe utilisateur", description: "Généré automatiquement.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Accès" },
  ],
  install: { image: "mariadb:11", entrypoint: "bash", script: '#!/bin/bash\necho "[MGG] MariaDB initialise la base au premier démarrage."\n' },
};

/** PostgreSQL 16 — robust relational database for modern apps. */
export const postgres: GameTemplate = {
  id: "postgres-16",
  game: "postgres",
  name: "PostgreSQL: Base de données",
  tagline: "Base SQL avancée pour apps modernes",
  description:
    "Serveur PostgreSQL 16 managé. Le choix par défaut pour les apps modernes (n8n, beaucoup de SaaS). Mot de passe généré automatiquement et visible dans les réglages.",
  author: "MGG",
  icon: "🐘",
  color: "#336791",
  category: "database",
  dockerImages: { "PostgreSQL 16": "postgres:16", "PostgreSQL 15": "postgres:15" },
  defaultImage: "postgres:16",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGINT", // Postgres: SIGINT = fast shutdown (clean)
  startupDoneRegex: "database system is ready to accept connections",
  docsUrl: "https://hub.docker.com/_/postgres",
  dataPath: "/var/lib/postgresql/data",
  resources: { memoryMb: 1024, cpuPercent: 100, diskMb: 8192 },
  features: ["database"],
  // PGPORT makes postgres listen on the allocated port (1:1 host↔container).
  ports: [{ name: "PostgreSQL", protocol: "tcp", default: 5432, envVar: "PGPORT", primary: true }],
  variables: [
    { key: "POSTGRES_PASSWORD", name: "Mot de passe", description: "Mot de passe du super-utilisateur. Généré automatiquement.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Accès" },
    { key: "POSTGRES_USER", name: "Utilisateur", description: "Super-utilisateur (aussi nom de la base par défaut).", default: "app", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Accès" },
    { key: "POSTGRES_DB", name: "Base à créer", description: "Base créée au premier démarrage.", default: "app", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Base" },
  ],
  install: { image: "postgres:16", entrypoint: "bash", script: '#!/bin/bash\necho "[MGG] PostgreSQL initialise la base au premier démarrage."\n' },
};

/** Redis 7 — in-memory cache / key-value store (password-protected by default). */
export const redis: GameTemplate = {
  id: "redis-7",
  game: "redis",
  name: "Redis: Cache / clé-valeur",
  tagline: "Cache mémoire ultra-rapide",
  description:
    "Serveur Redis 7 managé, protégé par mot de passe et avec persistance (AOF) activée. Pour le cache, les sessions, les files d'attente. Le mot de passe est généré automatiquement et visible dans les réglages.",
  author: "MGG",
  icon: "🧱",
  color: "#D82C20",
  category: "database",
  dockerImages: { "Redis 7": "redis:7", "Redis 7 Alpine": "redis:7-alpine" },
  defaultImage: "redis:7-alpine",
  // The official redis entrypoint does `exec "$@"`, so this command line runs.
  startupCommand: 'redis-server --port {{REDIS_PORT}} --requirepass "{{REDIS_PASSWORD}}" --appendonly yes',
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "Ready to accept connections",
  docsUrl: "https://hub.docker.com/_/redis",
  dataPath: "/data",
  resources: { memoryMb: 512, cpuPercent: 100, diskMb: 2048 },
  features: ["database"],
  ports: [{ name: "Redis", protocol: "tcp", default: 6379, envVar: "REDIS_PORT", primary: true }],
  variables: [
    { key: "REDIS_PASSWORD", name: "Mot de passe", description: "Mot de passe Redis (requirepass). Généré automatiquement.", default: "{{RANDOM}}", userViewable: true, userEditable: false, type: "string", rules: "required|string", group: "Accès" },
  ],
  install: { image: "redis:7-alpine", entrypoint: "sh", script: '#!/bin/sh\necho "[MGG] Redis prêt au démarrage (protégé par mot de passe)."\n' },
};
