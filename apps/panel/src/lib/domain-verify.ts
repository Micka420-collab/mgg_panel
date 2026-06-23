import "server-only";
import { promises as dns } from "node:dns";
import { env } from "./env";

/**
 * Validation + ownership verification for user-supplied custom domains.
 *
 * Ownership is proven the standard way: the user must create a DNS A record for
 * the hostname pointing at this node's public IP. We only wire the domain into
 * the reverse proxy once that record is live, which (a) proves they control the
 * domain and (b) ensures Caddy's ACME HTTP challenge will succeed.
 */

const FQDN_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/** The panel's own hostname — never allowed as a customer domain. */
function panelHost(): string {
  try {
    return new URL(env.appUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Validate a requested custom hostname. Returns an error string or null. */
export function validateHostname(raw: string): string | null {
  const h = raw.trim().toLowerCase();
  if (!h) return "Enter a domain.";
  if (h.length > 253) return "That domain is too long.";
  if (h.startsWith("*.") || h.includes("*")) return "Wildcard domains aren't supported.";
  if (!h.includes(".")) return "Enter a full domain, e.g. app.example.com.";
  if (!FQDN_RE.test(h)) return "That doesn't look like a valid domain.";
  if (h === panelHost()) return "That's this platform's own address.";
  if (h.endsWith(`.${env.domainBase}`) && env.domainBase) return "Use the free-subdomain feature for that domain.";
  return null;
}

export function normaliseHostname(raw: string): string {
  return raw.trim().toLowerCase().replace(/\.$/, "");
}

/**
 * Resolve the hostname's A records and check whether the node's public IP is
 * among them. Returns the records found so the UI can show what's currently set.
 */
export async function resolvesToNode(hostname: string, nodeIp: string): Promise<{ ok: boolean; found: string[] }> {
  try {
    const found = await dns.resolve4(hostname);
    return { ok: found.includes(nodeIp), found };
  } catch {
    return { ok: false, found: [] };
  }
}
