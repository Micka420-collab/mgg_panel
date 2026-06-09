import "server-only";
import type { User, Prisma } from "@prisma/client";
import { requireTemplate, resolveEnvironment } from "@mgg/shared";
import { db } from "./db";
import { HttpError } from "./auth";
import { randomString } from "./crypto";
import { buildServerSpec } from "./spec";
import { DaemonClient } from "./daemon";
import { audit } from "./audit";

type DbProtocol = "TCP" | "UDP" | "BOTH";
function protoFor(p: "tcp" | "udp" | "both"): DbProtocol {
  return p === "tcp" ? "TCP" : p === "udp" ? "UDP" : "BOTH";
}

export interface CreateServerInput {
  name: string;
  templateId: string;
  dockerImage?: string;
  nodeId?: string;
  variables?: Record<string, string>;
  limits?: { memoryMb?: number; cpuPercent?: number; diskMb?: number; swapMb?: number };
}

export async function createServer(user: User, input: CreateServerInput) {
  const template = requireTemplate(input.templateId);

  const node = input.nodeId
    ? await db.node.findUnique({ where: { id: input.nodeId } })
    : await db.node.findFirst({ where: { maintenance: false }, orderBy: { createdAt: "asc" } });
  if (!node) throw new HttpError(503, "No game node is available. Add a node in the admin panel.");

  // Resolve environment from template defaults + chosen variables (+ stable secrets).
  const environment = resolveEnvironment(template, input.variables ?? {}, { randomString });

  const limits = {
    memoryMb: input.limits?.memoryMb ?? template.resources.memoryMb,
    cpuPercent: input.limits?.cpuPercent ?? template.resources.cpuPercent,
    diskMb: input.limits?.diskMb ?? template.resources.diskMb,
    swapMb: input.limits?.swapMb ?? 0,
  };

  // Provisioning sanity cap: allow committing up to OVERCOMMIT× the node's RAM
  // (you can create more servers than fit at once — they run one/few at a time;
  // the daemon's START-time admission is what actually prevents host OOM).
  const OVERCOMMIT = Number(process.env.NODE_MEMORY_OVERCOMMIT ?? 8);
  const committed = await db.server.aggregate({ _sum: { memoryMb: true }, where: { nodeId: node.id } });
  const usedMb = committed._sum.memoryMb ?? 0;
  if (usedMb + limits.memoryMb > node.memoryMb * OVERCOMMIT) {
    throw new HttpError(
      503,
      `This node's reservation limit is reached (${(usedMb / 1024).toFixed(0)} GB committed, max ${((node.memoryMb * OVERCOMMIT) / 1024).toFixed(0)} GB). Delete an unused server or add a node.`,
    );
  }

  // SECURITY: only allow images declared by the template — never an arbitrary
  // user-supplied image (which the daemon would pull & run on the host).
  const allowedImages = new Set(Object.values(template.dockerImages));
  if (input.dockerImage && !allowedImages.has(input.dockerImage)) {
    throw new HttpError(422, "Invalid image for this game template");
  }
  const dockerImage = input.dockerImage ?? template.defaultImage;

  const primarySpec = template.ports.find((p) => p.primary) ?? template.ports[0]!;

  // Allocate ports + create the server, retrying on a concurrent port collision:
  // two creates can pick the same free port and the DB unique key rejects the
  // loser (P2002) — re-read the used ports and try again instead of 500ing.
  let server: Prisma.ServerGetPayload<{ include: { allocations: true } }>;
  for (let attempt = 0; ; attempt++) {
    const taken = await db.allocation.findMany({ where: { nodeId: node.id }, select: { port: true } });
    const used = new Set(taken.map((a) => a.port));
    const pickPort = (desired: number): number => {
      for (let p = desired; p < desired + 2000; p++) {
        if (!used.has(p)) {
          used.add(p);
          return p;
        }
      }
      throw new HttpError(503, "No free ports available on the node.");
    };
    const primaryPort = pickPort(primarySpec.default);
    const portPlan = template.ports.map((p) => {
      if (p === primarySpec) return { spec: p, port: primaryPort };
      const desired = p.offsetFromPrimary !== undefined ? primaryPort + p.offsetFromPrimary : p.default;
      return { spec: p, port: pickPort(desired) };
    });
    try {
      server = await db.server.create({
        data: {
          name: input.name.slice(0, 60),
          ownerId: user.id,
          nodeId: node.id,
          templateId: template.id,
          game: template.game,
          dockerImage,
          environment: environment as object,
          memoryMb: limits.memoryMb,
          cpuPercent: limits.cpuPercent,
          diskMb: limits.diskMb,
          swapMb: limits.swapMb,
          state: "installing",
          allocations: {
            create: portPlan.map(({ spec, port }) => ({
              nodeId: node.id,
              ip: node.publicIp,
              port,
              protocol: protoFor(spec.protocol),
              role: spec.name,
              primary: !!spec.primary || spec === primarySpec,
            })),
          },
        },
        include: { allocations: true },
      });
      break;
    } catch (e: any) {
      if (e?.code === "P2002" && attempt < 4) continue; // port race — re-read & retry
      throw e;
    }
  }

  // Hand the build spec to the daemon (async install/pull happens there).
  const spec = buildServerSpec(server, server.allocations);
  try {
    await new DaemonClient(node).registerServer(spec);
  } catch (e: any) {
    // Roll back: purge any partially-created container/volume on the node first
    // (a lost response / mid-build failure can leave an orphan holding ports),
    // then remove the DB rows.
    await new DaemonClient(node).destroy(server.id, true).catch(() => {});
    await db.server.delete({ where: { id: server.id } }).catch(() => {});
    throw new HttpError(502, `Node could not provision the server: ${e?.message ?? "unknown error"}`);
  }

  await audit("server.create", { userId: user.id, serverId: server.id, metadata: { templateId: template.id } });
  return server;
}
