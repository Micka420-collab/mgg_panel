import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { json, route } from "@/lib/http";
import {
  getSecretSetting, setSecretSetting, deleteSetting,
  SETTING_SMTP_HOST, SETTING_SMTP_PORT, SETTING_SMTP_USER, SETTING_SMTP_PASS, SETTING_SMTP_FROM, SETTING_SMTP_SECURE,
} from "@/lib/settings";

export const dynamic = "force-dynamic";

/** Current SMTP config (password never returned — only whether one is set). */
export const GET = route(async () => {
  await requireAdmin();
  const [host, port, user, from, secure, pass] = await Promise.all([
    getSecretSetting(SETTING_SMTP_HOST),
    getSecretSetting(SETTING_SMTP_PORT),
    getSecretSetting(SETTING_SMTP_USER),
    getSecretSetting(SETTING_SMTP_FROM),
    getSecretSetting(SETTING_SMTP_SECURE),
    getSecretSetting(SETTING_SMTP_PASS),
  ]);
  return json({
    host: host ?? "",
    port: Number(port ?? 587) || 587,
    user: user ?? "",
    from: from ?? "",
    secure: secure === "true",
    hasPass: !!pass,
    enabled: !!host,
  });
});

const schema = z.object({
  host: z.string().max(200),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  user: z.string().max(200).optional().default(""),
  pass: z.string().max(400).optional(), // only updated when provided
  from: z.string().max(200).optional().default(""),
  secure: z.boolean().optional().default(false),
});

export const POST = route(async (req) => {
  await requireAdmin();
  const b = schema.parse(await req.json());

  // Empty host = disable email (clear all SMTP settings).
  if (!b.host.trim()) {
    await Promise.all([
      deleteSetting(SETTING_SMTP_HOST), deleteSetting(SETTING_SMTP_PORT), deleteSetting(SETTING_SMTP_USER),
      deleteSetting(SETTING_SMTP_PASS), deleteSetting(SETTING_SMTP_FROM), deleteSetting(SETTING_SMTP_SECURE),
    ]);
    return json({ ok: true, enabled: false });
  }

  await setSecretSetting(SETTING_SMTP_HOST, b.host.trim());
  await setSecretSetting(SETTING_SMTP_PORT, String(b.port));
  await setSecretSetting(SETTING_SMTP_USER, b.user ?? "");
  await setSecretSetting(SETTING_SMTP_FROM, b.from ?? "");
  await setSecretSetting(SETTING_SMTP_SECURE, b.secure ? "true" : "false");
  if (b.pass) await setSecretSetting(SETTING_SMTP_PASS, b.pass); // keep existing pass if blank
  return json({ ok: true, enabled: true });
});
