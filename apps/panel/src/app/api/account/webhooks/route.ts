import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { randomToken } from "@/lib/crypto";
import { audit } from "@/lib/audit";

/** Events an owner can subscribe to. "*" means "every event". */
const WEBHOOK_EVENTS = [
  "*",
  "server.started",
  "server.stopped",
  "server.restarted",
  "server.errored",
  "backup.created",
] as const;

function serialize(w: {
  id: string;
  url: string;
  events: unknown;
  serverId: string | null;
  active: boolean;
  secret: string | null;
  createdAt: Date;
}) {
  return {
    id: w.id,
    url: w.url,
    events: Array.isArray(w.events) ? (w.events as string[]) : [],
    serverId: w.serverId,
    active: w.active,
    hasSecret: !!w.secret,
    createdAt: w.createdAt,
  };
}

export const GET = route(async () => {
  const user = await requireUser();
  const webhooks = await db.webhook.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, url: true, events: true, serverId: true, active: true, secret: true, createdAt: true },
  });
  return json({ webhooks: webhooks.map(serialize) });
});

const schema = z.object({
  url: z.string().url().max(2000).refine((u) => /^https?:\/\//i.test(u), "URL must be http(s)"),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
  serverId: z.string().min(1).optional().nullable(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { url, events, serverId } = schema.parse(await req.json());

  // If the webhook is bound to a server, the user must own that server.
  if (serverId) {
    const server = await db.server.findUnique({ where: { id: serverId }, select: { ownerId: true } });
    if (!server || server.ownerId !== user.id) throw new HttpError(404, "Server not found");
  }

  // A signing secret is generated server-side and shown once so receivers can
  // verify the X-MGG-Signature header.
  const secret = randomToken(24);

  const created = await db.webhook.create({
    data: {
      ownerId: user.id,
      serverId: serverId ?? null,
      url,
      events: Array.from(new Set(events)) as object,
      secret,
    },
    select: { id: true, url: true, events: true, serverId: true, active: true, secret: true, createdAt: true },
  });
  await audit("webhook.create", { userId: user.id, serverId: serverId ?? undefined, metadata: { url, events } });

  // Reveal the secret exactly once, on creation.
  return json({ webhook: { ...serialize(created), secret }, secret }, 201);
});
