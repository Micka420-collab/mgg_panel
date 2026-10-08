import { z } from "zod";
import { route, json } from "@/lib/http";
import { authApi, requireApiScope } from "@/lib/api-auth";
import { getServerContext, assertScope } from "@/lib/access";
import { reduceServerMemory } from "@/lib/server-memory";

const schema = z.object({ memoryMb: z.number().int().min(512) }).strict();
export const PATCH = route(async (req, ctx: { params: { id: string } }) => {
  const principal = await authApi(req);
  requireApiScope(principal, "startup.update");
  const c = await getServerContext(principal.user, ctx.params.id);
  assertScope(c, "startup.update");
  const { memoryMb } = schema.parse(await req.json());
  return json(await reduceServerMemory(c, memoryMb, principal.user.id));
});
