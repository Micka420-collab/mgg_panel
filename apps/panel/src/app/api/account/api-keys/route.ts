import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { generateApiKey } from "@/lib/api-auth";
import { LAUNCHER_DEFAULT_SCOPES, ALL_SCOPES } from "@mgg/shared";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  const user = await requireUser();
  const keys = await db.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true },
  });
  return json({ keys });
});

const schema = z.object({
  name: z.string().min(1).max(60),
  scopes: z.array(z.string()).optional(),
  admin: z.boolean().optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const { name, scopes, admin } = schema.parse(await req.json());
  const isAdminKey = !!admin && user.role === "ADMIN";
  const requested = scopes?.filter((s) => (ALL_SCOPES as readonly string[]).includes(s)) ?? [...LAUNCHER_DEFAULT_SCOPES];

  const { prefix, fullKey, keyHash } = generateApiKey(isAdminKey);
  await db.apiKey.create({
    data: { userId: user.id, name, prefix, keyHash, scopes: requested as object },
  });
  await audit("apikey.create", { userId: user.id, metadata: { name, prefix } });

  // The full key is shown exactly once.
  return json({ key: fullKey, prefix, scopes: requested });
});
