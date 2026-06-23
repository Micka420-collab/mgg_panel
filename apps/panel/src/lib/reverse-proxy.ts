import "server-only";
import { db } from "./db";
import { env } from "./env";

/**
 * Integrated reverse proxy — drives the bundled Caddy via its Admin API so a
 * user can point their OWN domain (from any registrar) at a server and get
 * automatic HTTPS with no extra software.
 *
 * How it works: the panel adds a host-matched route to Caddy's running config
 * (`<hostname>` → `reverse_proxy <nodeIp>:<port>`). Because the hostname is an
 * explicit matcher in the config, Caddy's automatic HTTPS obtains and renews a
 * Let's Encrypt certificate for it on its own — we never expose the admin API
 * publicly, and we only ever add a route AFTER the domain has been verified to
 * point at this node, so certificate issuance can't be abused.
 *
 * Every call here is best-effort and non-fatal: if Caddy is unreachable the
 * panel keeps working and the route is re-applied on the next resync.
 */

const ADMIN = env.caddyAdminUrl;
const TIMEOUT_MS = 5000;

export function caddyConfigured(): boolean {
  return !!ADMIN;
}

/** Stable, addressable id for a domain's route in Caddy (`/id/<routeId>`). */
function routeId(host: string): string {
  return `mgg-domain-${host.toLowerCase()}`;
}

export function upstreamFor(publicIp: string, port: number): string {
  return `${publicIp}:${port}`;
}

async function caddy(method: string, path: string, body?: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(`${ADMIN}${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

// The Caddyfile produces one HTTP server bound to :443/:80 (the panel vhost).
// We attach custom-domain routes to that same server (only one server may own
// :443). Discover its key once and cache it.
let cachedServer: string | null = null;
async function proxyServerName(): Promise<string> {
  if (cachedServer) return cachedServer;
  const res = await caddy("GET", "/config/apps/http/servers");
  if (!res.ok) throw new Error(`Caddy admin returned ${res.status}`);
  const servers = (await res.json()) as Record<string, { listen?: string[] }> | null;
  if (servers) {
    for (const [name, srv] of Object.entries(servers)) {
      if ((srv.listen ?? []).some((l) => l.endsWith(":443") || l.endsWith(":80"))) {
        cachedServer = name;
        return name;
      }
    }
    const first = Object.keys(servers)[0];
    if (first) {
      cachedServer = first;
      return first;
    }
  }
  throw new Error("No Caddy HTTP server is available to attach routes to.");
}

/** A host-matched route that forwards to the upstream with hardened headers. */
function routeObject(host: string, dial: string) {
  return {
    "@id": routeId(host),
    match: [{ host: [host.toLowerCase()] }],
    terminal: true,
    handle: [
      {
        handler: "subroute",
        routes: [
          {
            handle: [
              {
                handler: "headers",
                response: {
                  set: {
                    "Strict-Transport-Security": ["max-age=31536000; includeSubDomains"],
                    "X-Content-Type-Options": ["nosniff"],
                    "Referrer-Policy": ["strict-origin-when-cross-origin"],
                    "-Server": [""],
                  },
                },
              },
              {
                handler: "reverse_proxy",
                upstreams: [{ dial }],
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Add or replace the route for a verified custom domain. Throws on failure so
 * the caller can surface why the domain couldn't be activated.
 */
export async function upsertRoute(host: string, dial: string): Promise<void> {
  if (!ADMIN) throw new Error("The integrated reverse proxy is not enabled on this platform.");
  const srv = await proxyServerName();
  // Replace any existing route for this host (ignore "not found").
  await caddy("DELETE", `/id/${routeId(host)}`).catch(() => {});
  const res = await caddy("POST", `/config/apps/http/servers/${srv}/routes`, routeObject(host, dial));
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Caddy rejected the route (${res.status})${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
}

/** Remove a domain's route (best-effort). */
export async function removeRoute(host: string): Promise<void> {
  if (!ADMIN) return;
  await caddy("DELETE", `/id/${routeId(host)}`).catch(() => {});
}

/**
 * Re-apply every active domain's route. Caddy loses admin-added routes when it
 * reloads from the Caddyfile (e.g. a restart), so this runs at panel startup to
 * restore them. Best-effort and idempotent.
 */
export async function resyncDomains(): Promise<void> {
  if (!ADMIN) return;
  cachedServer = null; // re-discover after a possible Caddy restart
  const domains = await db.customDomain.findMany({
    where: { status: "active" },
    include: { server: { include: { node: true } } },
  });
  for (const d of domains) {
    try {
      await upsertRoute(d.hostname, upstreamFor(d.server.node.publicIp, d.targetPort));
    } catch {
      /* leave for the next resync */
    }
  }
}
