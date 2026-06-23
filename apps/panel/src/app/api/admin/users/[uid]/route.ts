import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin, HttpError } from "@/lib/auth";
import { json, noContent, route } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const schema = z.object({
  role: z.enum(["USER", "ADMIN"]).optional(),
  suspended: z.boolean().optional(),
});

/** Admin: change a user's role or suspend status. */
export const PATCH = route(async (req, ctx: { params: { uid: string } }) => {
  const me = await requireAdmin();
  const uid = ctx.params.uid;
  if (uid === me.id) throw new HttpError(403, "Tu ne peux pas modifier ton propre compte ici (sécurité anti-verrouillage).");

  const target = await db.user.findUnique({ where: { id: uid } });
  if (!target) throw new HttpError(404, "Utilisateur introuvable");
  const b = schema.parse(await req.json());

  const data: { role?: "USER" | "ADMIN"; suspended?: boolean } = {};
  if (b.role !== undefined && b.role !== target.role) {
    // Never strip the last administrator.
    if (target.role === "ADMIN" && b.role === "USER") {
      const admins = await db.user.count({ where: { role: "ADMIN" } });
      if (admins <= 1) throw new HttpError(400, "Impossible : c'est le dernier administrateur de la plateforme.");
    }
    data.role = b.role;
  }
  if (b.suspended !== undefined) data.suspended = b.suspended;

  if (Object.keys(data).length === 0) return json({ ok: true });
  await db.user.update({ where: { id: uid }, data });
  await audit("admin.user.update", { userId: me.id, serverId: undefined, metadata: { target: uid, username: target.username, ...data } });
  return json({ ok: true });
});

/** Admin: delete a user (blocked while they still own servers). */
export const DELETE = route(async (_req, ctx: { params: { uid: string } }) => {
  const me = await requireAdmin();
  const uid = ctx.params.uid;
  if (uid === me.id) throw new HttpError(403, "Tu ne peux pas supprimer ton propre compte.");

  const target = await db.user.findUnique({ where: { id: uid }, include: { _count: { select: { servers: true } } } });
  if (!target) throw new HttpError(404, "Utilisateur introuvable");
  if (target._count.servers > 0) {
    throw new HttpError(400, `Cet utilisateur possède ${target._count.servers} serveur(s). Supprime ou transfère ces serveurs avant de supprimer le compte.`);
  }
  await db.user.delete({ where: { id: uid } });
  await audit("admin.user.delete", { userId: me.id, metadata: { target: uid, username: target.username } });
  return noContent();
});
