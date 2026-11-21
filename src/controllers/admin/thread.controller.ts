import type { Request, Response } from "express";
import { Thread, User, ChatConversation } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok } from "../../utils/respond";
import { paging } from "../../utils/helpers";
import { emails } from "../../services/email.service";
import { emitTo, rooms } from "../../socket/realtime";
import { env } from "../../config/env";
import { audit } from "../../services/audit.service";

/* Customer messages & change requests from My OneVaya (and the AI concierge). */

export async function listThreads(req: Request, res: Response) {
  const { page, limit, skip } = paging(req.query);
  const filter: Record<string, unknown> = {};
  for (const k of ["status", "kind"] as const) if (typeof req.query[k] === "string") filter[k] = req.query[k];
  const [rows, total] = await Promise.all([
    Thread.find(filter).populate("customer", "name email").populate("booking", "ref title").sort("-updatedAt").skip(skip).limit(limit).lean(),
    Thread.countDocuments(filter),
  ]);
  ok(res, rows, 200, { page, limit, total });
}

export async function getThread(req: Request, res: Response) {
  const t = await Thread.findById(req.params.id).populate("customer", "name email phone").populate("booking", "ref title");
  if (!t) throw ApiError.notFound("Conversation not found");
  ok(res, t);
}

export async function replyThread(req: Request, res: Response) {
  const t = await Thread.findById(req.params.id);
  if (!t) throw ApiError.notFound("Conversation not found");
  t.messages.push({ from: "team", author: req.user!.id, name: req.user!.name, text: req.body.text });
  await t.save();
  // Live: the customer sees the reply instantly in My OneVaya; other staff see it in Messages.
  emitTo([rooms.staff, rooms.user(String(t.customer))], "thread:message", { threadId: String(t._id), status: t.status, message: t.messages[t.messages.length - 1] });
  const customer = await User.findById(t.customer).select("name email").lean();
  if (customer) await emails.teamReply(customer.email, customer.name, t.subject);
  ok(res, t);
}

export async function setThreadStatus(req: Request, res: Response) {
  const status = req.body.status === "resolved" ? "resolved" : "open";
  const t = await Thread.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!t) throw ApiError.notFound("Conversation not found");
  emitTo([rooms.staff, rooms.user(String(t.customer))], "thread:status", { threadId: String(t._id), status: t.status });
  ok(res, t);
}

// ── AI chat logs (review answers, pick up hand-overs) ──
const DAY = 24 * 60 * 60 * 1000;

/** When an archived chat may be deleted for good (undefined while it isn't archived). */
const deletableAfter = (archivedAt?: Date | null) => (archivedAt ? new Date(archivedAt.getTime() + env.CHAT_DELETE_GRACE_DAYS * DAY) : undefined);
const withRetention = <T extends { archivedAt?: Date | null }>(c: T) => ({ ...c, deletableAfter: deletableAfter(c.archivedAt) });

/** ?archived=true lists the archive; otherwise only active chats. ?handoff=true narrows to hand-overs. */
export async function listChats(req: Request, res: Response) {
  const { page, limit, skip } = paging(req.query);
  const filter: Record<string, unknown> = { archivedAt: req.query.archived === "true" ? { $ne: null } : null };
  if (req.query.handoff === "true") filter.handoffRequested = true;
  const [rows, total] = await Promise.all([
    ChatConversation.find(filter).populate("customer", "name email").sort(req.query.archived === "true" ? "-archivedAt" : "-updatedAt").skip(skip).limit(limit).lean(),
    ChatConversation.countDocuments(filter),
  ]);
  ok(res, rows.map(withRetention), 200, { page, limit, total });
}

export async function getChat(req: Request, res: Response) {
  const c = await ChatConversation.findById(req.params.id).populate("customer", "name email").lean();
  if (!c) throw ApiError.notFound("Chat not found");
  ok(res, withRetention(c));
}

const chatSummary = (c: { messages: unknown[]; customer?: unknown; createdAt?: Date; updatedAt?: Date }) => ({
  messages: c.messages.length,
  signedInCustomer: !!c.customer,
  started: c.createdAt,
  lastActivity: c.updatedAt,
});

/** POST /admin/chats/:id/archive: hides the chat from the working list (reversible). */
export async function archiveChat(req: Request, res: Response) {
  const c = await ChatConversation.findById(req.params.id);
  if (!c) throw ApiError.notFound("Chat not found");
  if (c.archivedAt) throw new ApiError(409, "This chat is already archived.");
  // Never hide a conversation that someone is still waiting on or in the middle of.
  if (c.staffActive) throw new ApiError(409, "A team member is replying in this chat. Hand it back to the AI first.");
  if (c.handoffRequested) throw new ApiError(409, "The guest asked for a person. Reply to them before archiving.");
  c.set({ archivedAt: new Date(), archivedBy: req.user!.id });
  await c.save();
  await audit(req, "chat.archive", "chat", c._id, `Archived a chat (${c.messages.length} messages)`, chatSummary(c));
  emitTo(rooms.staff, "chat:activity", { conversationId: String(c._id), archived: true });
  ok(res, withRetention(c.toObject()));
}

/** POST /admin/chats/:id/restore: puts an archived chat back in the working list. */
export async function restoreChat(req: Request, res: Response) {
  const c = await ChatConversation.findById(req.params.id);
  if (!c) throw ApiError.notFound("Chat not found");
  if (!c.archivedAt) throw new ApiError(409, "This chat isn't archived.");
  c.set({ archivedAt: undefined, archivedBy: undefined });
  await c.save();
  await audit(req, "chat.restore", "chat", c._id, `Restored a chat (${c.messages.length} messages)`, chatSummary(c));
  emitTo(rooms.staff, "chat:activity", { conversationId: String(c._id), archived: false });
  ok(res, withRetention(c.toObject()));
}

/**
 * DELETE /admin/chats/:id (admin only): permanent. Safeguards: the chat must be archived first, and for
 * CHAT_DELETE_GRACE_DAYS days, so a mistake can still be undone. The action is logged (counts and dates only).
 */
export async function deleteChat(req: Request, res: Response) {
  const c = await ChatConversation.findById(req.params.id);
  if (!c) throw ApiError.notFound("Chat not found");
  if (!c.archivedAt) throw new ApiError(409, "Archive this chat first. Chats are only deleted from the archive.");
  const allowedFrom = deletableAfter(c.archivedAt)!;
  if (Date.now() < allowedFrom.getTime()) {
    const days = Math.ceil((allowedFrom.getTime() - Date.now()) / DAY);
    throw new ApiError(409, `Archived chats are kept for ${env.CHAT_DELETE_GRACE_DAYS} days before they can be deleted. Try again in ${days} day${days === 1 ? "" : "s"}.`);
  }
  await audit(req, "chat.delete", "chat", c._id, `Permanently deleted a chat (${c.messages.length} messages)`, { ...chatSummary(c), archivedAt: c.archivedAt });
  await c.deleteOne();
  emitTo(rooms.staff, "chat:activity", { conversationId: String(c._id), removed: true });
  ok(res, { deleted: true });
}
