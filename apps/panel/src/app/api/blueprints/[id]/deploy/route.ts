import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { createServer } from "@/lib/provision";
import { requireTemplate } from "@mgg/shared";
import { DEFAULT_PLANS } from "@/lib/plans";
import { audit } from "@/lib/audit";

/**
 * Deploy a new server from a blueprint — one-click "spin up this setup".
 *
 * This reuses the exact same create path as POST /api/servers (the shared
 * `createServer` helper from @/lib/provision), passing the blueprint's templateId
 * + snapshotted variables, and applies a resource plan (the caller's choice, else
 * the blueprint's recommended plan). It increments the blueprint's deploy counter.
 */

export const dynamic = "force-dynamic";

interface BlueprintRow {
  id: string;
  ownerId: string;
  templateId: string;
  variables: unknown;
  planSlug: string | null;
  public: boolean;
}

const deploySchema = z.object({
  name: z.string().min(1).max(60),
  planSlug: z.string().optional(),
});

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const body = deploySchema.parse(await req.json());

  const b = (await db.blueprint.findUnique({ where: { id: ctx.params.id } })) as unknown as BlueprintRow | null;
  if (!b) throw new HttpError(404, "Blueprint not found");
  if (!b.public && b.ownerId !== user.id) throw new HttpError(403, "This blueprint is private.");

  // 404/422 if the template registry no longer knows this game.
  requireTemplate(b.templateId);

  // Plan precedence: explicit choice → blueprint recommendation → template default.
  const slug = body.planSlug ?? b.planSlug ?? undefined;
  const plan = slug ? DEFAULT_PLANS.find((p) => p.slug === slug) : undefined;
  if (slug && !plan) throw new HttpError(422, "Unknown plan.");

  const variables = (b.variables as Record<string, string>) ?? {};

  const server = await createServer(user, {
    name: body.name,
    templateId: b.templateId,
    variables,
    limits: plan ? { memoryMb: plan.memoryMb, cpuPercent: plan.cpuPercent, diskMb: plan.diskMb } : undefined,
  });

  // Best-effort popularity counter (never block the deploy on it).
  await db.blueprint
    .update({ where: { id: b.id }, data: { deploys: { increment: 1 } } })
    .catch(() => {});

  await audit("blueprint.deploy", {
    userId: user.id,
    serverId: server.id,
    metadata: { blueprintId: b.id, templateId: b.templateId },
  });

  return json({ id: server.id }, 201);
});
