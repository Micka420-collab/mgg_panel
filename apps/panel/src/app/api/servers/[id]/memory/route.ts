import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { route, json } from "@/lib/http";
import { getServerContext, assertScope } from "@/lib/access";
import { reduceServerMemory } from "@/lib/server-memory";

const schema = z.object({ memoryMb: z.number().int().min(512) }).strict();
export const PATCH = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "startup.update");
  const { memoryMb } = schema.parse(await req.json());
  return json(await reduceServerMemory(c, memoryMb, user.id));
});
