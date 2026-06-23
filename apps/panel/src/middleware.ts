import { NextResponse, type NextRequest } from "next/server";
import { hit, clientIp } from "@/lib/ratelimit";

/**
 * L7 anti-abuse / anti-DDoS layer for the panel:
 *  - tiered per-IP rate limiting (strict on auth endpoints)
 *  - 429 + Retry-After / RateLimit-* headers
 *  - baseline security headers on every API response
 */

const WINDOW = 60_000;

function tierFor(path: string): { bucket: string; limit: number } {
  // brute-force-sensitive endpoints get a tight budget
  if (
    path.startsWith("/api/auth") ||
    path.startsWith("/api/v1/auth") ||
    path.startsWith("/api/account/2fa")
  ) {
    return { bucket: "auth", limit: 20 };
  }
  // public, unauthenticated wake links — moderate
  if (path.startsWith("/api/wake")) return { bucket: "wake", limit: 40 };
  // public, unauthenticated server pages — each hits the daemon, so keep tight
  if (path.startsWith("/api/public")) return { bucket: "public", limit: 30 };
  // everything else under /api
  return { bucket: "api", limit: 120 };
}

export function middleware(req: NextRequest) {
  const ip = clientIp(req.headers);
  const path = req.nextUrl.pathname;
  const { bucket, limit } = tierFor(path);
  const rl = hit(`${bucket}:${ip}`, limit, WINDOW);

  const res = rl.ok
    ? NextResponse.next()
    : new NextResponse(JSON.stringify({ error: "Too many requests — slow down." }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": String(rl.retryAfter) },
      });

  res.headers.set("RateLimit-Limit", String(rl.limit));
  res.headers.set("RateLimit-Remaining", String(rl.remaining));
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "SAMEORIGIN");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return res;
}

// Only guard the API surface (not static assets / pages).
export const config = { matcher: ["/api/:path*"] };
