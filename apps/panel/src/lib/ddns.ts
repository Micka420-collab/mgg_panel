import "server-only";
import { env } from "./env";

/**
 * DuckDNS dynamic-DNS integration.
 *
 * DuckDNS lets you map a free "<domain>.duckdns.org" name to whatever IP your
 * home connection currently has. Hitting the update endpoint on a schedule keeps
 * that record pointed at the box even when the ISP rotates the address, giving
 * players one stable address to connect to.
 *
 * Config comes from the environment:
 *   DUCKDNS_DOMAIN  the subdomain label only (e.g. "mgg" for mgg.duckdns.org)
 *   DUCKDNS_TOKEN   the account token from the DuckDNS dashboard
 */

/** Whether DuckDNS is configured (both domain and token present). */
export function duckDnsConfigured(): boolean {
  return Boolean(env.duckDnsDomain && env.duckDnsToken);
}

/** The full stable hostname players connect to, or null when not configured. */
export function duckDnsHostname(): string | null {
  return env.duckDnsDomain ? `${env.duckDnsDomain}.duckdns.org` : null;
}

// Remembers the last IP DuckDNS acknowledged so the status endpoint/UI can show
// what the record currently points at. Process-local (fine for the in-process
// scheduler); resets on restart, repopulated on the next update.
let lastIp: string | null = null;
let lastUpdateAt: number | null = null;

export function lastDuckDnsIp(): string | null {
  return lastIp;
}
export function lastDuckDnsUpdateAt(): number | null {
  return lastUpdateAt;
}

/** Fetch this machine's public IPv4 via ipify, or null on failure. */
export async function publicIp(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org", {
      // never cache — we want the live address
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const ip = (await res.text()).trim();
    return ip || null;
  } catch {
    return null;
  }
}

/**
 * Push an update to DuckDNS. When `ip` is omitted DuckDNS auto-detects the
 * caller's address (the usual behaviour). Returns true when DuckDNS replied "OK".
 */
export async function updateDuckDns(domain: string, token: string, ip?: string): Promise<boolean> {
  if (!domain || !token) return false;
  const url =
    `https://www.duckdns.org/update?domains=${encodeURIComponent(domain)}` +
    `&token=${encodeURIComponent(token)}&ip=${encodeURIComponent(ip ?? "")}`;
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const body = (await res.text()).trim();
    const ok = res.ok && body.split(/\s+/)[0] === "OK";
    if (ok) {
      lastIp = ip ?? (await publicIp()) ?? lastIp;
      lastUpdateAt = Date.now();
    }
    return ok;
  } catch {
    return false;
  }
}

/**
 * Convenience wrapper that reads the configured domain/token from env and runs
 * an update. No-ops (returns false) when DuckDNS isn't configured. Safe to call
 * every scheduler tick.
 */
export async function updateDuckDnsFromEnv(ip?: string): Promise<boolean> {
  if (!duckDnsConfigured()) return false;
  return updateDuckDns(env.duckDnsDomain, env.duckDnsToken, ip);
}
