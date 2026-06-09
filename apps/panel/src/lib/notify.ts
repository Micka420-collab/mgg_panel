import "server-only";

const COLORS: Record<string, number> = { info: 0x22b8d8, warning: 0xfbbf24, critical: 0xf85149 };

/** Post an alert embed to a Discord webhook (best-effort, never throws). */
export async function sendDiscordWebhook(
  url: string,
  alert: { title: string; description?: string; level?: "info" | "warning" | "critical"; ts?: string },
): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "MGG",
        embeds: [
          {
            title: alert.title,
            description: alert.description ?? undefined,
            color: COLORS[alert.level ?? "warning"],
            footer: { text: "MGG monitor" },
            timestamp: alert.ts,
          },
        ],
      }),
    });
  } catch {
    /* never let alerting break the caller */
  }
}
