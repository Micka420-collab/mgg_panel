import { requireAdmin, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { sendMail } from "@/lib/email";

export const dynamic = "force-dynamic";

/** Send a test email to the current admin to validate SMTP. */
export const POST = route(async () => {
  const admin = await requireAdmin();
  if (!admin.email) throw new HttpError(400, "Ton compte n'a pas d'adresse email.");
  const ok = await sendMail(
    admin.email,
    "[MGG] Email de test ✅",
    `<!doctype html><body style="font-family:system-ui;background:#0a0e14;color:#e8edf2;padding:32px">
      <div style="font-weight:800;font-size:20px">MGG<span style="color:#22B8D8">·</span>Panel</div>
      <p style="margin-top:16px;color:rgba(232,237,242,.7)">Si tu lis ceci, la configuration SMTP fonctionne 🎉. Les notifications par email sont opérationnelles.</p>
    </body>`,
  );
  if (!ok) throw new HttpError(400, "SMTP non configuré — renseigne d'abord l'hôte SMTP.");
  return json({ ok: true, sentTo: admin.email });
});
