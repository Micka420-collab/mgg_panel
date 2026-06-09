import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, noContent, route } from "@/lib/http";
import { getTemplate } from "@mgg/shared";
import { audit } from "@/lib/audit";

/**
 * A single blueprint. GET is readable by anyone for a public blueprint (or the
 * owner for a private one); DELETE is owner-only.
 */

export const dynamic = "force-dynamic";

interface BlueprintRow {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  icon: string;
  game: string;
  templateId: string;
  variables: unknown;
  modpack: string | null;
  planSlug: string | null;
  tags: unknown;
  public: boolean;
  deploys: number;
  createdAt: Date;
}

export const GET = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const b = (await db.blueprint.findUnique({ where: { id: ctx.params.id } })) as unknown as BlueprintRow | null;
  if (!b) throw new HttpError(404, "Blueprint not found");
  if (!b.public && b.ownerId !== user.id) throw new HttpError(403, "This blueprint is private.");

  const tpl = getTemplate(b.templateId);
  return json({
    blueprint: {
      id: b.id,
      title: b.title,
      description: b.description,
      icon: b.icon || tpl?.icon || "🧩",
      game: b.game,
      templateId: b.templateId,
      templateName: tpl?.name ?? b.templateId,
      color: tpl?.color ?? "#00B4D8",
      variables: (b.variables as Record<string, string>) ?? {},
      modpack: b.modpack,
      planSlug: b.planSlug,
      tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
      public: b.public,
      deploys: b.deploys,
      mine: b.ownerId === user.id,
      deployable: !!tpl, // false if the underlying template was removed
      createdAt: b.createdAt,
    },
  });
});

export const DELETE = route(async (_req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const b = (await db.blueprint.findUnique({ where: { id: ctx.params.id } })) as unknown as BlueprintRow | null;
  if (!b) throw new HttpError(404, "Blueprint not found");
  if (b.ownerId !== user.id && user.role !== "ADMIN") throw new HttpError(403, "Only the owner can delete this blueprint.");

  await db.blueprint.delete({ where: { id: b.id } });
  await audit("blueprint.delete", { userId: user.id, metadata: { blueprintId: b.id } });
  return noContent();
});
