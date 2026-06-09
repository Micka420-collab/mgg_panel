import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { getServerContext } from "@/lib/access";
import { getTemplate } from "@mgg/shared";
import { audit } from "@/lib/audit";

/**
 * Blueprint Marketplace.
 *
 * A "Blueprint" is a shareable snapshot of a server's setup — its template/game,
 * resolved startup variables, chosen modpack and a recommended plan — that anyone
 * can deploy as a brand-new server in one click. This route lists blueprints
 * (public + your own) and publishes a new one from a server you own.
 *
 * It is a thin metadata layer over the existing Server model and the @mgg/shared
 * template registry; deploying just re-runs the normal create-server flow.
 */

export const dynamic = "force-dynamic";

// Env keys that carry a modpack reference, snapshotted into Blueprint.modpack.
const MODPACK_KEYS = ["MODRINTH_MODPACK", "CF_PAGE_URL", "MODPACK", "GENERIC_PACK"];

interface BlueprintRow {
  id: string;
  ownerId: string;
  title: string;
  description: string | null;
  icon: string;
  game: string;
  templateId: string;
  modpack: string | null;
  planSlug: string | null;
  tags: unknown;
  public: boolean;
  deploys: number;
  createdAt: Date;
}

function shape(b: BlueprintRow, viewerId: string) {
  const tpl = getTemplate(b.templateId);
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    icon: b.icon || tpl?.icon || "🧩",
    game: b.game,
    templateId: b.templateId,
    templateName: tpl?.name ?? b.templateId,
    color: tpl?.color ?? "#00B4D8",
    modpack: b.modpack,
    planSlug: b.planSlug,
    tags: Array.isArray(b.tags) ? (b.tags as string[]) : [],
    public: b.public,
    deploys: b.deploys,
    mine: b.ownerId === viewerId,
    createdAt: b.createdAt,
  };
}

export const GET = route(async (req) => {
  const user = await requireUser();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const mine = url.searchParams.get("mine") === "1";

  // Visible set: public blueprints OR your own. When ?mine=1, restrict to yours.
  const visibility = mine ? [{ ownerId: user.id }] : [{ public: true }, { ownerId: user.id }];
  const where: Prisma.BlueprintWhereInput = { OR: visibility };
  if (q) {
    // Case-insensitive match on title/description; tag filtering is done in-app
    // because tags is a Json column (portable across providers).
    where.AND = [
      {
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
    ];
  }

  const rows = (await db.blueprint.findMany({
    where,
    orderBy: [{ deploys: "desc" }, { createdAt: "desc" }],
    take: 200,
  })) as unknown as BlueprintRow[];

  // Lightweight tag search so "fabric" or "vanilla+" also match by tag.
  const ql = q.toLowerCase();
  const filtered =
    q && rows.length
      ? rows.filter(
          (b) =>
            b.title.toLowerCase().includes(ql) ||
            (b.description ?? "").toLowerCase().includes(ql) ||
            (Array.isArray(b.tags) ? (b.tags as string[]) : []).some((t) => t.toLowerCase().includes(ql)),
        )
      : rows;

  return json({ blueprints: filtered.map((b) => shape(b, user.id)) });
});

const publishSchema = z.object({
  serverId: z.string().min(1),
  title: z.string().min(1).max(80),
  description: z.string().max(500).optional(),
  tags: z.array(z.string().min(1).max(24)).max(8).optional(),
  public: z.boolean().optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = publishSchema.parse(await req.json());

  // You may only publish a server you OWN (not one shared with you as a sub-user).
  const c = await getServerContext(user, body.serverId);
  if (!c.isOwner) throw new HttpError(403, "Only the server owner can publish it as a blueprint.");

  const tpl = getTemplate(c.server.templateId);
  if (!tpl) throw new HttpError(422, "This server's game template is no longer available to publish.");

  // Snapshot only USER-VIEWABLE variables (never secrets/internal env) so the
  // blueprint is safe to share publicly.
  const env = (c.server.environment as Record<string, string>) ?? {};
  const variables: Record<string, string> = {};
  for (const v of tpl.variables) {
    if (v.userViewable && env[v.key] !== undefined) variables[v.key] = env[v.key];
  }

  const modpack = MODPACK_KEYS.map((k) => env[k]).find((v) => v && v.trim()) ?? null;
  const tags = [...new Set((body.tags ?? []).map((t) => t.trim()).filter(Boolean))].slice(0, 8);

  const created = (await db.blueprint.create({
    data: {
      ownerId: user.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      icon: tpl.icon ?? "🧩",
      game: c.server.game,
      templateId: c.server.templateId,
      variables: variables as object,
      modpack,
      planSlug: null,
      tags: tags as object,
      public: body.public ?? true,
    },
  })) as unknown as BlueprintRow;

  await audit("blueprint.publish", {
    userId: user.id,
    serverId: c.server.id,
    metadata: { blueprintId: created.id, templateId: c.server.templateId },
  });

  return json({ id: created.id, blueprint: shape(created, user.id) }, 201);
});
