import { z } from "zod";
import { requireUser, HttpError } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { hit } from "@/lib/ratelimit";
import { getServerContext, assertScope } from "@/lib/access";
import { DaemonClient } from "@/lib/daemon";
import { getTemplate } from "@mgg/shared";
import { hasScope } from "@mgg/shared";
import {
  askAssistant,
  type AssistantContext,
  type AssistantMessage,
  type AssistantVariable,
} from "@/lib/assistant";
import { runCopilotAgent } from "@/lib/copilot-agent";
import { getAnthropicKey } from "@/lib/settings";

/**
 * AI Server Copilot endpoint.
 *
 * POST { messages: [{ role, content }] } -> { reply, suggestedCommands?, actions?, source }
 *
 * Entry is gated on `control.console`. With NO Anthropic key set, the Copilot is
 * a read-only rule-based helper (it only gathers context and proposes commands).
 * With a key set, it becomes an AGENTIC copilot that can take REAL actions —
 * power, console, settings, mods/plugins, create servers — each one re-checked
 * against THIS user's scopes inside the tool executor, so it can never exceed
 * what the user could do by hand. Bounded by a per-user rate limit below (each
 * message can fan out to several Anthropic calls).
 */

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(40),
});

export const dynamic = "force-dynamic";

export const POST = route(async (req, ctx: { params: { id: string } }) => {
  const user = await requireUser();
  const c = await getServerContext(user, ctx.params.id);
  assertScope(c, "control.console");

  // Per-user cap: a single message can drive up to MAX_TURNS Anthropic calls, so
  // bound how many messages a user can send per minute (cost / abuse guard).
  const rl = hit(`copilot:${user.id}`, 20, 60_000);
  if (!rl.ok) throw new HttpError(429, `You're sending messages too fast. Try again in ${rl.retryAfter}s.`);

  const { messages } = schema.parse(await req.json());

  const env = (c.server.environment as Record<string, string>) ?? {};
  const tpl = getTemplate(c.server.templateId);

  // Live state (falls back to the cached row state if the node is unreachable).
  let state = c.server.state as string;
  try {
    const status = await new DaemonClient(c.node).status(c.server.id);
    if (status?.state) state = status.state;
  } catch {
    /* node offline -> use cached state */
  }

  // Build user-viewable startup variables with their effective values, exactly
  // like the server detail route does, so the copilot reasons over real config.
  const variables: AssistantVariable[] = (tpl?.variables ?? [])
    .filter((v) => v.userViewable)
    .map((v) => ({
      key: v.key,
      name: v.name,
      value: env[v.key] ?? v.default,
      options: v.options,
    }));

  const canCommand = hasScope(c.scopes, "control.command");

  const assistantCtx: AssistantContext = {
    serverName: c.server.name,
    game: c.server.game,
    templateId: c.server.templateId,
    templateName: tpl?.name,
    // Common itzg/Minecraft env names; harmless for other games (undefined).
    type: env.TYPE ?? env.SERVER_TYPE,
    version: env.VERSION ?? env.SERVER_VERSION ?? env.MC_VERSION,
    state,
    features: tpl?.features ?? [],
    variables,
    // The daemon exposes console only over WebSocket (no HTTP tail endpoint), so
    // we intentionally omit consoleTail; the helper degrades gracefully without it.
    consoleTail: undefined,
    canCommand,
  };

  // A key set from the admin dashboard takes precedence over the env var.
  const { key } = await getAnthropicKey();

  // With a key, run the AGENTIC Copilot: it can take real actions (power,
  // settings, mods, create servers) — strictly within THIS user's permissions,
  // re-checked per tool. Without a key, fall back to the read-only rule helper.
  const result = key
    ? await runCopilotAgent({
        user,
        currentServerId: c.server.id,
        ctx: assistantCtx,
        messages: messages as AssistantMessage[],
        apiKey: key,
      })
    : await askAssistant(assistantCtx, messages as AssistantMessage[], null);

  return json(result);
});
