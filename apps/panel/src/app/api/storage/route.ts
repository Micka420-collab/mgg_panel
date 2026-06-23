import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, route } from "@/lib/http";
import { DaemonClient } from "@/lib/daemon";
import { getTemplate } from "@mgg/shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/storage — VM disk usage. Admins see every node + every server; a
 * regular user sees the node(s) hosting their servers and their own servers' sizes.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";

  // Personal view: ONLY the servers you own or that are explicitly shared with
  // you — never other tenants' servers, even for an admin. (Global capacity per
  // node is still shown to admins below; the per-server breakdown stays yours.)
  const servers = await db.server.findMany({
    where: { OR: [{ ownerId: user.id }, { subusers: { some: { userId: user.id } } }] },
    include: { node: true },
  });

  // Which nodes to query: admins see all nodes; users see nodes hosting their servers.
  const nodeMap = new Map<string, (typeof servers)[number]["node"]>();
  if (isAdmin) {
    for (const n of await db.node.findMany()) nodeMap.set(n.id, n);
  } else {
    for (const s of servers) nodeMap.set(s.nodeId, s.node);
  }

  const sizeById = new Map<string, number>();
  const nodes = await Promise.all(
    [...nodeMap.values()].map(async (node) => {
      try {
        const rep = await new DaemonClient(node).storage();
        for (const v of rep.servers) sizeById.set(v.id, v.bytes);
        return { id: node.id, name: node.name, fqdn: node.fqdn, online: true, fs: rep.fs };
      } catch {
        return { id: node.id, name: node.name, fqdn: node.fqdn, online: false, fs: null };
      }
    }),
  );

  const serverList = servers
    .map((s) => ({
      id: s.id,
      name: s.name,
      game: s.game,
      icon: getTemplate(s.templateId)?.icon ?? "🎮",
      nodeId: s.nodeId,
      bytes: sizeById.get(s.id) ?? 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  return json({ isAdmin, nodes, servers: serverList });
});
