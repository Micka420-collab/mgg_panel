import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { HttpError } from "@/lib/auth";
import { sha256, constantTimeEqual } from "@/lib/crypto";
import { emailAlert } from "@/lib/email";

export const dynamic = "force-dynamic";

const schema = z.object({
  serverId: z.string().min(1).max(64),
  severity: z.enum(["info", "warning", "critical"]).default("warning"),
  category: z.string().min(1).max(40),
  message: z.string().min(1).max(500),
});

/**
 * Internal endpoint — the daemon reports security events here (reconnect spam,
 * crashes, lag storms, …). Authenticated with the shared DAEMON_TOKEN. Each
 * event becomes an Alert row so it surfaces in the dashboard Security feed.
 */
export const POST = route(async (req) => {
  const auth = (await headers()).get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !constantTimeEqual(sha256(token), sha256(process.env.DAEMON_TOKEN ?? ""))) throw new HttpError(401, "unauthorized");

  const b = schema.parse(await req.json());
  // Unique key per event — this is an append-only feed, not a deduped status.
  const rnd = Math.random().toString(36).slice(2, 8);
  await db.alert.create({
    data: {
      key: `sec:${b.serverId}:${b.category}:${Date.now()}:${rnd}`,
      level: b.severity,
      message: `🛡️ [${b.category}] ${b.message}`,
      serverId: b.serverId,
      resolved: false,
    },
  });
  // Email the owner on serious security events (best-effort; info-level stays in-panel).
  if (b.severity !== "info") await emailAlert({ level: b.severity, message: `[${b.category}] ${b.message}`, serverId: b.serverId });
  return json({ ok: true });
});
