const isProd = process.env.NODE_ENV === "production";
// `next build` runs with NODE_ENV=production but must not require real secrets;
// enforce the fail-closed secret checks only at RUNTIME, never during the build.
const enforceProd = isProd && process.env.NEXT_PHASE !== "phase-production-build";

// Well-known placeholders that must never be used as real secrets in production.
const DEV_SECRETS = new Set([
  "dev-auth-secret-change-me",
  "dev-api-secret-change-me",
  "dev-daemon-token-change-me",
  "change-me-shared-secret-between-panel-and-daemon",
  "dev-auth-secret-change-me-please-generate-a-long-random-string",
  "dev-api-secret-change-me-too",
]);

function required(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v !== undefined && v !== "") return v;
  if (fallback !== undefined) return fallback;
  if (isProd) throw new Error(`Missing required env var: ${key}`);
  return `dev-${key.toLowerCase()}`;
}

const optional = (key: string) => process.env[key] ?? "";

/**
 * Read a security-critical secret and FAIL CLOSED: in production we refuse to
 * boot if it is unset, a known placeholder, or too short. In development we
 * fall back to a fixed value (with a loud warning) so local dev still works.
 */
function secret(key: string, devFallback: string): string {
  const v = process.env[key];
  if (v !== undefined && v.trim() !== "") {
    if (enforceProd && (DEV_SECRETS.has(v) || v.length < 16)) {
      throw new Error(
        `${key} is a placeholder or too short. Set a strong value in production (>=16 chars). Generate with: openssl rand -base64 48`,
      );
    }
    return v;
  }
  if (enforceProd) throw new Error(`Missing required secret ${key} in production`);
  if (!isProd) console.warn(`[env] ${key} is not set — using an INSECURE dev default. Never do this in production.`);
  return devFallback;
}

export const env = {
  appUrl: required("APP_URL", "http://localhost:3000"),
  authSecret: secret("AUTH_SECRET", "dev-auth-secret-change-me"),
  apiJwtSecret: secret("API_JWT_SECRET", "dev-api-secret-change-me"),
  daemonToken: secret("DAEMON_TOKEN", "dev-daemon-token-change-me"),
  defaultNodeFqdn: required("DEFAULT_NODE_FQDN", "localhost"),
  nodePublicIp: required("NODE_PUBLIC_IP", "127.0.0.1"),
  isProd,

  // Trust forwarded client-IP headers only when behind a known reverse proxy
  // (the bundled Caddy sets X-Real-Client-IP from the real socket peer).
  trustProxy: optional("TRUST_PROXY") !== "0",

  // Free-subdomain DNS (optional). When DOMAIN_BASE + a provider are set, users
  // can claim "<sub>.<DOMAIN_BASE>" and the panel writes A + SRV records.
  domainBase: optional("DOMAIN_BASE"), // e.g. "aether.host"
  dnsProvider: optional("DNS_PROVIDER") || "none", // "cloudflare" | "none"
  cloudflareToken: optional("CLOUDFLARE_API_TOKEN"),
  cloudflareZoneId: optional("CLOUDFLARE_ZONE_ID"),

  // CurseForge (optional) — enables the CurseForge content source.
  curseforgeKey: optional("CURSEFORGE_API_KEY"),
  steamApiKey: optional("STEAM_API_KEY"),

  // DuckDNS (optional) — stable "<domain>.duckdns.org" that follows the home IP.
  // DUCKDNS_DOMAIN is the label only (e.g. "aether"), not the full hostname.
  duckDnsDomain: optional("DUCKDNS_DOMAIN"),
  duckDnsToken: optional("DUCKDNS_TOKEN"),

  // Monitoring — Discord webhook URL alerts are posted to (optional).
  alertWebhook: optional("ALERT_WEBHOOK"),
};
