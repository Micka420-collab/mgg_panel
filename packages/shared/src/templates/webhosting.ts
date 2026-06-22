import type { GameTemplate } from "./template.js";

/**
 * Web hosting templates — serve a website for your game community, or anything
 * else. Standard official images, env-driven, plugged into MGG's engine (upload
 * your files via the file manager, point a domain at the Network tab address).
 */

/** Nginx — host a static website (HTML/CSS/JS) or a built SPA. */
export const nginxStatic: GameTemplate = {
  id: "nginx-static",
  game: "nginx",
  name: "Nginx: Site web statique",
  tagline: "Héberge un site HTML/CSS/JS ou une SPA",
  description:
    "Serveur web Nginx pour héberger un site statique : la vitrine de ton serveur de jeu, une SPA (React/Vue buildée), une page de vote… Dépose tes fichiers dans le gestionnaire de fichiers (dossier du site), puis pointe un domaine sur l'adresse de l'onglet Réseau.",
  author: "MGG",
  icon: "🌐",
  color: "#009639",
  category: "web",
  dockerImages: { "Nginx (alpine)": "nginx:alpine", "Nginx (stable)": "nginx:stable-alpine" },
  defaultImage: "nginx:alpine",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGTERM",
  startupDoneRegex: "start worker process|Configuration complete; ready for start up",
  docsUrl: "https://hub.docker.com/_/nginx",
  dataPath: "/usr/share/nginx/html",
  resources: { memoryMb: 256, cpuPercent: 100, diskMb: 4096 },
  features: ["web", "world-upload"],
  // Host 8100 (80=panel/Caddy, 8080=daemon are taken); nginx listens on 80 inside.
  ports: [{ name: "HTTP", protocol: "tcp", default: 8100, containerPort: 80, primary: true }],
  variables: [],
  install: {
    image: "nginx:alpine",
    entrypoint: "sh",
    script: '#!/bin/sh\necho "[MGG] Nginx prêt. Dépose ton site dans /usr/share/nginx/html via le gestionnaire de fichiers."\n',
  },
};

/**
 * WordPress — the world's most popular CMS. Needs a MySQL/MariaDB: deploy one
 * first (catalogue → Bases de données), then set the DB host/credentials below
 * (host = adresse du serveur MySQL dans son onglet Réseau).
 */
export const wordpress: GameTemplate = {
  id: "wordpress",
  game: "wordpress",
  name: "WordPress: Site / Blog",
  tagline: "Le CMS n°1 — site, blog, boutique",
  description:
    "Héberge un site WordPress (blog, vitrine, boutique WooCommerce). Nécessite une base MySQL/MariaDB : déploie-la d'abord depuis le catalogue, puis renseigne l'hôte et les identifiants de la base ci-dessous. Thèmes et extensions s'installent ensuite depuis WordPress.",
  author: "MGG",
  icon: "📝",
  color: "#21759B",
  category: "web",
  dockerImages: { "WordPress (Apache)": "wordpress:latest", "WordPress (PHP 8.3)": "wordpress:php8.3-apache" },
  defaultImage: "wordpress:latest",
  startupCommand: "",
  stopCommand: "^SIGTERM",
  stopSignal: "SIGWINCH", // Apache graceful stop
  startupDoneRegex: "apache2 -D FOREGROUND|resuming normal operations|Command line: 'apache2",
  docsUrl: "https://hub.docker.com/_/wordpress",
  dataPath: "/var/www/html",
  resources: { memoryMb: 1024, cpuPercent: 150, diskMb: 8192 },
  features: ["web"],
  // Host 8101 (80=panel, 8080=daemon taken); Apache listens on 80 inside.
  ports: [{ name: "HTTP", protocol: "tcp", default: 8101, containerPort: 80, primary: true }],
  variables: [
    { key: "WORDPRESS_DB_HOST", name: "Hôte de la base (host:port)", description: "Adresse du serveur MySQL/MariaDB, ex: 192.168.1.137:3306 (voir l'onglet Réseau de ta base).", default: "", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Base de données" },
    { key: "WORDPRESS_DB_NAME", name: "Nom de la base", description: "Doit correspondre à la base créée sur ton serveur MySQL.", default: "wordpress", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Base de données" },
    { key: "WORDPRESS_DB_USER", name: "Utilisateur DB", description: "Utilisateur de la base.", default: "app", userViewable: true, userEditable: true, type: "string", rules: "required|string", group: "Base de données" },
    { key: "WORDPRESS_DB_PASSWORD", name: "Mot de passe DB", description: "Mot de passe de l'utilisateur de la base.", default: "", userViewable: true, userEditable: true, type: "string", rules: "string", group: "Base de données" },
    { key: "WORDPRESS_TABLE_PREFIX", name: "Préfixe des tables", description: "Préfixe SQL (défaut wp_).", default: "wp_", userViewable: true, userEditable: true, type: "string", rules: "string", group: "Avancé" },
  ],
  install: {
    image: "wordpress:latest",
    entrypoint: "bash",
    script: '#!/bin/bash\necho "[MGG] WordPress. Pense à déployer une base MySQL et à renseigner WORDPRESS_DB_HOST."\n',
  },
};
