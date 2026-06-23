import { json, route } from "@/lib/http";
import { getPublicServer } from "@/lib/public-server";

/**
 * Public, unauthenticated live status for a server's shareable page
 * (`/s/<subdomain>`). Returns only player-facing fields (see PublicServer).
 * Rate-limited by the global middleware (the generic `api` tier). Never
 * triggers any state change — wake-on-join is handled by the edge proxy when a
 * player actually connects, so there's no abusable "start" action here.
 */
export const dynamic = "force-dynamic";

export const GET = route(async (_req, ctx: { params: { subdomain: string } }) => {
  const data = await getPublicServer(ctx.params.subdomain);
  if (!data) return json({ error: "No server with that address." }, 404);
  return json(data, 200);
});
