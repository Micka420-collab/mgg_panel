import "server-only";
import type { Allocation, Node, Server, User } from "@prisma/client";
import { ALL_SCOPES, hasScope, type Scope } from "@mgg/shared";
import { db } from "./db";
import { HttpError } from "./auth";

export interface ServerContext {
  server: Server;
  node: Node;
  allocations: Allocation[];
  scopes: string[];
  isOwner: boolean;
}

/**
 * Load a server the user is allowed to touch, computing their effective scopes.
 * Owners and admins implicitly hold every scope; sub-users hold their granted set.
 */
export async function getServerContext(user: User, serverId: string): Promise<ServerContext> {
  const server = await db.server.findUnique({
    where: { id: serverId },
    include: { node: true, allocations: true, subusers: { where: { userId: user.id } } },
  });
  if (!server) throw new HttpError(404, "Server not found");

  const isOwner = server.ownerId === user.id;
  const isAdmin = user.role === "ADMIN";
  let scopes: string[];
  if (isOwner || isAdmin) {
    scopes = [...ALL_SCOPES];
  } else {
    const sub = server.subusers[0];
    if (!sub) throw new HttpError(403, "You do not have access to this server");
    scopes = (sub.scopes as string[]) ?? [];
  }

  return { server, node: server.node, allocations: server.allocations, scopes, isOwner: isOwner || isAdmin };
}

export function assertScope(ctx: ServerContext, scope: Scope): void {
  if (!hasScope(ctx.scopes, scope)) throw new HttpError(403, `Missing permission: ${scope}`);
}

/** Block state-changing actions on a suspended server (the billing/abuse lever). */
export function assertNotSuspended(ctx: ServerContext): void {
  if (ctx.server.suspended) throw new HttpError(403, "This server is suspended.");
}
