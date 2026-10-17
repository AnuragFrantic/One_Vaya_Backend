import Anthropic from "@anthropic-ai/sdk";
import { ChatbotKnowledge, Faq } from "../../models";
import { aiEnabled, getClaude, models } from "./client";
import { CHAT_SYSTEM } from "./prompts";
import { chatTools, runChatTool, type ToolContext } from "./chatTools";
import { demoChatReply } from "./demo";
import { logger } from "../../utils/logger";

export type ChatTurn = { role: "user" | "assistant"; text: string };

const MAX_TOOL_ROUNDS = 6;
const FALLBACK_REPLY =
  "I'm sorry, I can't help with that here. Would you like me to connect you with a OneVaya travel designer?";

/** Approved information block (admin-managed knowledge + published FAQs). */
async function approvedInformation() {
  const [kb, faqs] = await Promise.all([
    ChatbotKnowledge.find({ isActive: true }).sort("category title").lean(),
    Faq.find({ isPublished: true }).sort("category order").lean(),
  ]);
  const kbText = kb.map((k) => `## ${k.title}\n${k.content}`).join("\n\n");
  const faqText = faqs.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  return `<approved_information>\n${kbText}\n\n# FAQ\n${faqText}\n</approved_information>`;
}

/**
 * Produces the concierge reply for one user message.
 * Live mode: Claude (AI_CHAT_MODEL) with OneVaya-only tools. Demo mode: rule-based replies.
 */
export async function chatReply(history: ChatTurn[], message: string, ctx: ToolContext): Promise<{ reply: string; mode: "ai" | "demo" }> {
  if (!aiEnabled()) return { reply: await demoChatReply(message, ctx), mode: "demo" };
  try {
    return await claudeReply(history, message, ctx);
  } catch (err) {
    // Wrong key, no credit, rate limit or outage: keep the website working with demo replies.
    if (err instanceof Anthropic.APIError) logger.error(`Claude API error ${err.status}: ${err.message}`);
    else logger.error("Chat failed:", err);
    return { reply: await demoChatReply(message, ctx), mode: "demo" };
  }
}

async function claudeReply(history: ChatTurn[], message: string, ctx: ToolContext): Promise<{ reply: string; mode: "ai" | "demo" }> {
  const client = getClaude();
  // Stable, cacheable block first; per-request details after it.
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: `${CHAT_SYSTEM}\n\n${await approvedInformation()}`, cache_control: { type: "ephemeral" } },
    {
      type: "text",
      text: ctx.customerId
        ? `The guest is signed in as ${ctx.customerName ?? "a customer"}. Booking tools are available.`
        : "The guest is not signed in. Booking tools are not available; ask them to sign in to My OneVaya for trip-specific questions.",
    },
  ];
  const tools = chatTools(!!ctx.customerId);

  // Earlier turns are replayed as plain text only (no thinking blocks), which keeps the history append-only.
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-12).map((t) => ({ role: t.role, content: t.text }) as Anthropic.MessageParam),
    { role: "user", content: message },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: models.chat,
      max_tokens: 4000,
      system,
      tools,
      messages,
      output_config: { effort: "low" },
    });

    if (response.stop_reason === "refusal") return { reply: FALLBACK_REPLY, mode: "ai" };

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return { reply: text || FALLBACK_REPLY, mode: "ai" };
    }

    messages.push({ role: "assistant", content: response.content });
    // Run all requested tools, then return every result in ONE user message.
    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
        try {
          return { type: "tool_result", tool_use_id: tu.id, content: await runChatTool(tu.name, tu.input, ctx) };
        } catch (err) {
          logger.warn(`Chat tool ${tu.name} failed:`, err instanceof Error ? err.message : err);
          return { type: "tool_result", tool_use_id: tu.id, is_error: true, content: err instanceof Error ? err.message : "Tool failed" };
        }
      }),
    );
    messages.push({ role: "user", content: results });
  }
  return { reply: FALLBACK_REPLY, mode: "ai" };
}
