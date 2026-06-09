import os from "node:os";

function env(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}

const isWindows = process.platform === "win32";

export const config = {
  port: Number(env("DAEMON_PORT", "8080")),
  /** shared secret: HTTP Bearer (panel -> daemon) and HMAC for WS JWTs (browser -> daemon) */
  token: env("DAEMON_TOKEN", "dev-daemon-token-change-me"),
  /** host directory where each server's bind-mounted volume lives */
  dataDir: env("DAEMON_DATA_DIR", isWindows ? `${os.tmpdir()}\\mgg\\volumes` : "/var/lib/mgg/volumes"),
  backupDir: env("DAEMON_BACKUP_DIR", isWindows ? `${os.tmpdir()}\\mgg\\backups` : "/var/lib/mgg/backups"),
  dockerSocket: env("DOCKER_SOCKET", isWindows ? "//./pipe/docker_engine" : "/var/run/docker.sock"),
  publicIp: env("NODE_PUBLIC_IP", "127.0.0.1"),
  logLevel: env("LOG_LEVEL", "info"),
  /** container name prefix */
  prefix: "mgg",
  /** panel base URL the daemon calls back for SFTP auth */
  panelUrl: env("PANEL_URL", "http://localhost:3000"),
  /** SFTP listen port (0 disables the SFTP server) */
  sftpPort: Number(env("SFTP_PORT", "2022")),
  /** where the generated SSH host key is stored */
  hostKeyPath: env("SFTP_HOST_KEY", isWindows ? `${os.tmpdir()}\\mgg\\ssh_host_key` : "/var/lib/mgg/ssh_host_key"),
} as const;

// Fail closed in production: never run with a placeholder / weak node token.
const DEV_TOKENS = new Set(["dev-daemon-token-change-me", "change-me-shared-secret-between-panel-and-daemon"]);
if (process.env.NODE_ENV === "production" && (config.token.length < 16 || DEV_TOKENS.has(config.token))) {
  throw new Error("DAEMON_TOKEN must be a strong secret in production (>=16 chars, not a placeholder).");
}

export type Config = typeof config;
