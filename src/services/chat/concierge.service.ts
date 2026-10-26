import { ChatConversation } from "../../models";
import { env } from "../../config/env";
import { ApiError } from "../../utils/ApiError";
import { aiEnabled } from "../ai/client";
import { chatReply, type ChatTurn } from "../ai/chat.service";
import type { SessionUser } from "../../middleware/auth";
import { emitTo, rooms } from "../../socket/realtime";

/*
 * The OneVaya Concierge conversation flow, shared by REST (POST /api/ai/chat) and Socket.io (`chat:message`).
 * Conversations are stored so staff can review them, pick up hand-overs and reply live.
 */

export type ConciergeInput = { conversationId?: string; visitorId?: string; message: string; page?: string; user?: SessionUser };
export type ChatMessageOut = { role: "user" | "assistant" | "staff"; text: string; name?: string; at: Date };
export type ConciergeResult = {
  conversationId: string;
  reply: string | null; // null while a staff member has taken over (their reply arrives live)
  mode: "ai" | "demo";
  handoffRequested: boolean;
  staffActive: boolean;
  messages: ChatMessageOut[]; // the messages added by this turn
};

/** Finds the conversation if this guest may continue it (same signed-in customer or same visitor id). */
export async function findOwnConversation(conversationId: string | undefined, visitorId: string | undefined, user?: SessionUser) {
  if (!conversationId) return null;
  const convo = await ChatConversation.findById(conversationId).catch(() => null);
  if (!convo) return null;
  const customerId = user?.role === "customer" ? user.id : undefined;
  const allowed = convo.customer ? String(convo.customer) === customerId : !!visitorId && convo.visitorId === visitorId;
  return allowed ? convo : null;
}

/** Sends this turn's messages to everyone viewing the conversation (the guest's tabs and any staff watching). */
export function broadcastTurn(result: ConciergeResult) {
  for (const m of result.messages) emitTo(rooms.chat(result.conversationId), "chat:message", { conversationId: result.conversationId, ...m });
}

export async function handleConciergeMessage({ conversationId, visitorId, message, page, user }: ConciergeInput): Promise<ConciergeResult> {
  const customerId = user?.role === "customer" ? user.id : undefined;
  let convo = await findOwnConversation(conversationId, visitorId, user);
  const isNew = !convo;
  convo ??= new ChatConversation({ customer: customerId, visitorId, page, mode: aiEnabled() ? "ai" : "demo" });

  const userTurns = convo.messages.filter((m) => m.role === "user").length;
  if (userTurns >= env.AI_CHAT_MAX_TURNS) {
    throw new ApiError(429, "This conversation is quite long — please start a new one or contact a travel designer.");
  }

  const now = new Date();
  const added: ChatMessageOut[] = [{ role: "user", text: message, at: now }];

  if (convo.staffActive) {
    // A team member is answering personally: store the message and let them see it live.
    convo.messages.push({ role: "user", text: message, at: now });
    await convo.save();
  } else {
    const history: ChatTurn[] = convo.messages.map((m) => ({ role: m.role === "user" ? "user" : "assistant", text: m.text ?? "" }));
    const { reply, mode } = await chatReply(history, message, {
      customerId,
      customerName: user?.name,
      conversationId: String(convo._id),
      onHandoff: () => {
        convo!.handoffRequested = true;
      },
    });
    const at = new Date();
    convo.messages.push({ role: "user", text: message, at: now }, { role: "assistant", text: reply, at });
    convo.mode = mode;
    await convo.save();
    added.push({ role: "assistant", text: reply, at });
  }

  const id = String(convo._id);
  // Admin panel "AI chats" updates live; hand-over requests get their own alert.
  emitTo(rooms.staff, "chat:activity", { conversationId: id, isNew, last: message, handoffRequested: convo.handoffRequested, staffActive: convo.staffActive, at: now });
  if (convo.handoffRequested && !convo.staffActive) emitTo(rooms.staff, "chat:handoff", { conversationId: id, customer: user?.name ?? "Website visitor", last: message });

  return {
    conversationId: id,
    reply: convo.staffActive ? null : (added[1]?.text ?? null),
    mode: convo.mode as "ai" | "demo",
    handoffRequested: convo.handoffRequested,
    staffActive: convo.staffActive,
    messages: added,
  };
}
