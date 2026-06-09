import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { createServer } from "@/lib/provision";
import { getTemplate, buildAddress, requireTemplate } from "@mgg/shared";
import { DEFAULT_PLANS } from "@/lib/plans";
import { reconcileStates } from "@/lib/server-state";

export const GET = route(async () => {
  const user = await requireUser();
  const servers = await db.server.findMany({
    where: { OR: [{ ownerId: user.id }, { subusers: { some: { userId: user.id } } }] },
    include: { allocations: true, node: true },
    orderBy: { createdAt: "desc" },
  });
  const states = await reconcileStates(servers);

  const data = servers.map((s) => {
    const tpl = getTemplate(s.templateId);
    const primary = s.allocations.find((a) => a.primary) ?? s.allocations[0];
    const defaultPort = tpl?.ports.find((p) => p.primary)?.default ?? primary?.port ?? 0;
    return {
      id: s.id,
      name: s.name,
      game: s.game,
      templateId: s.templateId,
      templateName: tpl?.name ?? s.templateId,
      icon: tpl?.icon ?? "🎮",
      color: tpl?.color ?? "#00B4D8",
      state: states.get(s.id) ?? s.state,
      owner: s.ownerId === user.id,
      memoryMb: s.memoryMb,
      cpuPercent: s.cpuPercent,
      diskMb: s.diskMb,
      address: primary ? buildAddress(primary.ip, primary.port, defaultPort) : null,
      createdAt: s.createdAt,
    };
  });
  return json({ servers: data });
});

const createSchema = z.object({
  name: z.string().min(1).max(60),
  templateId: z.string().min(1),
  image: z.string().optional(),
  planSlug: z.string().optional(),
  variables: z.record(z.string()).optional(),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  const body = createSchema.parse(await req.json());
  requireTemplate(body.templateId); // 400/throws if unknown

  const plan = body.planSlug ? DEFAULT_PLANS.find((p) => p.slug === body.planSlug) : undefined;
  const server = await createServer(user, {
    name: body.name,
    templateId: body.templateId,
    dockerImage: body.image,
    variables: body.variables,
    limits: plan ? { memoryMb: plan.memoryMb, cpuPercent: plan.cpuPercent, diskMb: plan.diskMb } : undefined,
  });

  return json({ id: server.id }, 201);
});
