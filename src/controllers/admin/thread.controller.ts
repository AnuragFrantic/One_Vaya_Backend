import type { Request, Response } from "express";
import { Thread, User, ChatConversation } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok } from "../../utils/respond";
import { paging } from "../../utils/helpers";
import { emails } from "../../services/email.service";

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
  const customer = await User.findById(t.customer).select("name email").lean();
  if (customer) await emails.teamReply(customer.email, customer.name, t.subject);
  ok(res, t);
}

export async function setThreadStatus(req: Request, res: Response) {
  const status = req.body.status === "resolved" ? "resolved" : "open";
  const t = await Thread.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!t) throw ApiError.notFound("Conversation not found");
  ok(res, t);
}

// ── AI chat logs (review answers, pick up hand-overs) ──
export async function listChats(req: Request, res: Response) {
  const { page, limit, skip } = paging(req.query);
  const filter = req.query.handoff === "true" ? { handoffRequested: true } : {};
  const [rows, total] = await Promise.all([
    ChatConversation.find(filter).populate("customer", "name email").sort("-updatedAt").skip(skip).limit(limit).lean(),
    ChatConversation.countDocuments(filter),
  ]);
  ok(res, rows, 200, { page, limit, total });
}

export async function getChat(req: Request, res: Response) {
  const c = await ChatConversation.findById(req.params.id).populate("customer", "name email").lean();
  if (!c) throw ApiError.notFound("Chat not found");
  ok(res, c);
}
