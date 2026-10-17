import type { Request, Response } from "express";
import { ChatConversation } from "../models";
import { ok } from "../utils/respond";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";
import { aiEnabled } from "../services/ai/client";
import { chatReply, type ChatTurn } from "../services/ai/chat.service";
import { suggestItinerary } from "../services/ai/planner.service";

/**
 * POST /api/ai/chat — the OneVaya Concierge (website + portal).
 * Conversations are stored so staff can review them and pick up hand-overs.
 */
export async function chat(req: Request, res: Response) {
  const { conversationId, visitorId, message, page } = req.body;
  const customerId = req.user?.role === "customer" ? req.user.id : undefined;

  let convo = conversationId ? await ChatConversation.findById(conversationId) : null;
  // A conversation can only be continued by the same signed-in customer or the same visitor.
  if (convo && (convo.customer ? String(convo.customer) !== customerId : convo.visitorId !== visitorId)) convo = null;
  convo ??= new ChatConversation({ customer: customerId, visitorId, page, mode: aiEnabled() ? "ai" : "demo" });

  const userTurns = convo.messages.filter((m) => m.role === "user").length;
  if (userTurns >= env.AI_CHAT_MAX_TURNS) {
    throw new ApiError(429, "This conversation is quite long — please start a new one or contact a travel designer.");
  }

  const history: ChatTurn[] = convo.messages.map((m) => ({ role: m.role as "user" | "assistant", text: m.text ?? "" }));
  const { reply, mode } = await chatReply(history, message, {
    customerId,
    customerName: req.user?.name,
    conversationId: String(convo._id),
    onHandoff: () => {
      convo!.handoffRequested = true;
    },
  });

  convo.messages.push({ role: "user", text: message }, { role: "assistant", text: reply });
  convo.mode = mode;
  await convo.save();

  ok(res, { conversationId: String(convo._id), reply, mode, handoffRequested: convo.handoffRequested });
}

/** POST /api/ai/plan — AI itinerary suggestion (always returns a validated plan). */
export async function plan(req: Request, res: Response) {
  ok(res, await suggestItinerary(req.body));
}

/** GET /api/ai/status — lets the website show whether the AI is live or in demo mode. */
export async function status(_req: Request, res: Response) {
  ok(res, { mode: aiEnabled() ? "ai" : "demo", chatModel: env.AI_CHAT_MODEL, plannerModel: env.AI_PLANNER_MODEL });
}
