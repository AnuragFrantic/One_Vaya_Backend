import type { Request, Response } from "express";
import { Booking, Quote, TravelDocument, Invoice, Payment, Thread, User } from "../models";
import { emitTo, rooms } from "../socket/realtime";
import { ApiError } from "../utils/ApiError";
import { ok, created } from "../utils/respond";
import { getDownloadUrl } from "../services/storage.service";

/*
 * My OneVaya — customer portal. Every query is scoped to the signed-in customer
 * (req.user.id), so customers can only ever see their own records.
 */

const me = (req: Request) => req.user!.id;
const BOOKING_PUBLIC = "-items.cost -items.supplierName -items.supplierRef -createdBy";

export async function getProfile(req: Request, res: Response) {
  ok(res, await User.findById(me(req)));
}

export async function updateProfile(req: Request, res: Response) {
  ok(res, await User.findByIdAndUpdate(me(req), req.body, { new: true, runValidators: true }));
}

/** Overview: upcoming & past trips (bookings) plus quotes sent to the customer. */
export async function listTrips(req: Request, res: Response) {
  const [bookings, quotes] = await Promise.all([
    Booking.find({ customer: me(req) }).select(BOOKING_PUBLIC).sort("-startDate"),
    Quote.find({ customer: me(req), status: { $in: ["sent", "accepted"] } }).select("-items.unitCost -ruleOverrides -createdBy").sort("-createdAt"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  ok(res, {
    upcoming: bookings.filter((b) => (b.endDate ?? "") >= today && b.status !== "cancelled"),
    past: bookings.filter((b) => (b.endDate ?? "") < today || b.status === "cancelled"),
    quotes,
  });
}

export async function getTrip(req: Request, res: Response) {
  const booking = await Booking.findOne({ _id: req.params.id, customer: me(req) }).select(BOOKING_PUBLIC);
  if (!booking) throw ApiError.notFound("Trip not found");
  const [documents, invoices, payments, threads] = await Promise.all([
    TravelDocument.find({ booking: booking._id, visibleToCustomer: true }).select("-fileKey").lean(),
    Invoice.find({ booking: booking._id, visibleToCustomer: true }).lean(),
    Payment.find({ booking: booking._id }).select("-recordedBy").lean(),
    Thread.find({ booking: booking._id, customer: me(req) }).sort("-updatedAt").lean(),
  ]);
  const paid = payments.reduce((s, p) => s + p.amountAED, 0);
  ok(res, { booking, documents, invoices, payments, threads, totals: { total: (booking.get("totalPrice") as number), paid } });
}

export async function listDocuments(req: Request, res: Response) {
  ok(res, await TravelDocument.find({ customer: me(req), visibleToCustomer: true }).select("-fileKey").populate("booking", "ref title startDate endDate").sort("-createdAt").lean());
}

/** Returns a short-lived download link — only for the customer's own, visible, ready documents. */
export async function downloadDocument(req: Request, res: Response) {
  const doc = await TravelDocument.findOne({ _id: req.params.id, customer: me(req), visibleToCustomer: true, status: "ready" });
  if (!doc?.fileKey) throw ApiError.notFound("Document not available");
  ok(res, { url: await getDownloadUrl(doc.fileKey, safeName(doc.name, doc.mimeType)) });
}

export async function listInvoices(req: Request, res: Response) {
  const [invoices, payments] = await Promise.all([
    Invoice.find({ customer: me(req), visibleToCustomer: true }).populate("booking", "ref title").sort("-date").lean(),
    Payment.find({ customer: me(req) }).select("-recordedBy").populate("booking", "ref title").sort("-date").lean(),
  ]);
  const invoiced = invoices.reduce((s, i) => s + i.amountAED, 0);
  const paid = payments.reduce((s, p) => s + p.amountAED, 0);
  ok(res, { invoices, payments, totals: { invoiced, paid, outstanding: Math.max(invoiced - paid, 0) } });
}

export async function listThreads(req: Request, res: Response) {
  ok(res, await Thread.find({ customer: me(req) }).populate("booking", "ref title").sort("-updatedAt").lean());
}

export async function createThread(req: Request, res: Response) {
  const { bookingId, subject, kind, text } = req.body;
  if (bookingId && !(await Booking.exists({ _id: bookingId, customer: me(req) }))) throw ApiError.notFound("Trip not found");
  const thread = await Thread.create({
    booking: bookingId,
    customer: me(req),
    subject,
    kind,
    messages: [{ from: "customer", author: me(req), name: req.user!.name, text }],
  });
  // Live: the team sees the new conversation; the customer's other tabs update too.
  emitTo([rooms.staff, rooms.user(me(req))], "thread:new", { threadId: String(thread._id), subject: thread.subject, kind: thread.kind, customer: req.user!.name });
  created(res, thread);
}

export async function replyThread(req: Request, res: Response) {
  const thread = await Thread.findOne({ _id: req.params.id, customer: me(req) });
  if (!thread) throw ApiError.notFound("Conversation not found");
  thread.messages.push({ from: "customer", author: me(req), name: req.user!.name, text: req.body.text });
  thread.status = "open";
  await thread.save();
  emitTo([rooms.staff, rooms.user(me(req))], "thread:message", { threadId: String(thread._id), status: thread.status, message: thread.messages[thread.messages.length - 1] });
  ok(res, thread);
}

export function safeName(name: string, mime?: string | null) {
  const ext = mime === "application/pdf" ? ".pdf" : mime?.startsWith("image/") ? `.${mime.split("/")[1]}` : "";
  return `${name.replace(/[^\w\s.-]/g, "").trim().slice(0, 80) || "document"}${ext}`;
}
