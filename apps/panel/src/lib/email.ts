import "server-only";
import nodemailer from "nodemailer";
import { db } from "./db";
import { getSmtpConfig } from "./settings";

const ACCENT: Record<string, string> = { critical: "#F85149", warning: "#FBBF24", info: "#22B8D8" };

/** Branded HTML wrapper for a transactional email. */
function template(title: string, message: string, level: string, cta?: { label: string; url: string }): string {
  const accent = ACCENT[level] ?? ACCENT.info;
  return `<!doctype html><html><body style="margin:0;background:#0a0e14;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#e8edf2">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <div style="font-weight:800;font-size:20px;letter-spacing:-.5px;margin-bottom:24px">MGG<span style="color:#22B8D8">·</span>Panel</div>
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-left:3px solid ${accent};border-radius:14px;padding:24px">
      <div style="font-size:18px;font-weight:700;color:#fff">${title}</div>
      <div style="margin-top:10px;color:rgba(232,237,242,.7);font-size:14px;line-height:1.6">${message}</div>
      ${cta ? `<a href="${cta.url}" style="display:inline-block;margin-top:18px;background:linear-gradient(135deg,#22B8D8,#7C5CFF);color:#fff;text-decoration:none;padding:11px 20px;border-radius:12px;font-weight:600;font-size:14px">${cta.label}</a>` : ""}
    </div>
    <div style="margin-top:20px;font-size:12px;color:rgba(232,237,242,.35)">Email automatique de MGG Panel · tu peux te désabonner depuis ton compte.</div>
  </div></body></html>`;
}

/** Low-level send. No-op (returns false) when SMTP isn't configured. */
export async function sendMail(to: string | string[], subject: string, html: string): Promise<boolean> {
  const cfg = await getSmtpConfig();
  if (!cfg) return false;
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
  await transport.sendMail({
    from: cfg.from,
    to: Array.isArray(to) ? to.join(",") : to,
    subject,
    html,
  });
  return true;
}

/**
 * Email the right recipients about an alert — the server owner (if they kept email
 * notifications on), or all admins for node/global alerts. Best-effort: never throws.
 */
export async function emailAlert(opts: { level: string; message: string; serverId?: string | null }): Promise<void> {
  try {
    const cfg = await getSmtpConfig();
    if (!cfg) return;

    let recipients: string[] = [];
    let serverName: string | null = null;
    if (opts.serverId) {
      const s = await db.server.findUnique({ where: { id: opts.serverId }, select: { name: true, ownerId: true } });
      if (!s) return;
      serverName = s.name;
      const owner = await db.user.findUnique({ where: { id: s.ownerId }, select: { email: true, emailNotifications: true } });
      if (owner?.emailNotifications && owner.email) recipients = [owner.email];
    } else {
      const admins = await db.user.findMany({ where: { role: "ADMIN", emailNotifications: true }, select: { email: true } });
      recipients = admins.map((a) => a.email).filter(Boolean);
    }
    if (!recipients.length) return;

    const base = (process.env.PANEL_URL || "").replace(/\/$/, "");
    const cta = opts.serverId && base ? { label: "Ouvrir le serveur", url: `${base}/dashboard/servers/${opts.serverId}` } : undefined;
    const title = serverName ? `${serverName} — ${opts.message}` : opts.message;
    await sendMail(recipients, `[MGG] ${opts.message}`, template(title, opts.message, opts.level, cta));
  } catch (e) {
    console.warn("[email] emailAlert failed:", (e as Error)?.message);
  }
}
