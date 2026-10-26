import type { Request, Response } from "express";
import { ok } from "../utils/respond";
import { env } from "../config/env";
import { aiEnabled } from "../services/ai/client";
import { suggestItinerary } from "../services/ai/planner.service";
import { broadcastTurn, handleConciergeMessage } from "../services/chat/concierge.service";

/**
 * POST /api/ai/chat — the OneVaya Concierge over plain HTTP (the same flow is available live over
 * Socket.io as `chat:message`, see src/socket/index.ts). Conversations are stored for staff review.
 */
export async function chat(req: Request, res: Response) {
  const { conversationId, visitorId, message, page } = req.body;
  const result = await handleConciergeMessage({ conversationId, visitorId, message, page, user: req.user });
  broadcastTurn(result); // staff watching this chat in the admin panel see it live
  ok(res, { conversationId: result.conversationId, reply: result.reply, mode: result.mode, handoffRequested: result.handoffRequested, staffActive: result.staffActive });
}

/** POST /api/ai/plan — AI itinerary suggestion (always returns a validated plan). */
export async function plan(req: Request, res: Response) {
  ok(res, await suggestItinerary(req.body));
}

/** GET /api/ai/status — lets the website show whether the AI is live or in demo mode. */
export async function status(_req: Request, res: Response) {
  ok(res, { mode: aiEnabled() ? "ai" : "demo", chatModel: env.AI_CHAT_MODEL, plannerModel: env.AI_PLANNER_MODEL });
}
