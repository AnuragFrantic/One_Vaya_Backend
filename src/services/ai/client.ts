import Anthropic from "@anthropic-ai/sdk";
import { env, features } from "../../config/env";

/**
 * The ONLY place the Claude client is created.
 * When ANTHROPIC_API_KEY is empty the AI features run in demo mode (see demo.ts),
 * so buying the API later only means pasting the key into `.env` and restarting.
 */
let client: Anthropic | null = null;

export const aiEnabled = () => features.ai;

export function getClaude() {
  if (!features.ai) throw new Error("AI is in demo mode (no ANTHROPIC_API_KEY)");
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 });
  return client;
}

export const models = {
  chat: env.AI_CHAT_MODEL, // claude-haiku-5-5 (fast, low cost)
  planner: env.AI_PLANNER_MODEL, // claude-opus-5-5 (best quality)
};
