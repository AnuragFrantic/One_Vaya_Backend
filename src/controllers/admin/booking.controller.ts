import type { Request, Response } from "express";
import { Booking, Quote, User, TravelDocument, Payment, Invoice, Thread, hashPassword } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import { escapeRegex, nextReference, paging, randomToken, sha256 } from "../../utils/helpers";
import { emails } from "../../services/email.service";
import { env } from "../../config/env";

export async function listBookings(req: Request, res: Response) {
  const { page, limit, skip, sort } = paging(req.query);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.status === "string") filter.status = req.query.status;
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const rx = new RegExp(escapeRegex(req.query.q.trim()), "i");
    filter.$or = [{ ref: rx }, { title: rx }, { destination: rx }];
  }
  const [rows, total] = await Promise.all([
    Booking.find(filter).sort(sort).skip(skip).limit(limit).populate("customer", "name email"),
    Booking.countDocuments(filter),
  ]);
  ok(res, rows, 200, { page, limit, total });
}

/** Booking with everything staff need: documents (incl. pending), invoices, payments, messages, balance. */
export async function getBooking(req: Request, res: Response) {
  const booking = await Booking.findById(req.params.id).populate("customer", "name email phone").populate("quote", "ref");
  if (!booking) throw ApiError.notFound("Booking not found");
  const [documents, invoices, payments, threads] = await Promise.all([
    TravelDocument.find({ booking: booking._id }).sort("-createdAt").lean(),
    Invoice.find({ booking: booking._id }).sort("-date").lean(),
    Payment.find({ booking: booking._id }).populate("recordedBy", "name").sort("-date").lean(),
    Thread.find({ booking: booking._id }).sort("-updatedAt").lean(),
  ]);
  const paid = payments.reduce((s, p) => s + p.amountAED, 0);
  const total = booking.get("totalPrice") as number;
  ok(res, {
    booking,
    documents,
    invoices,
    payments,
    threads,
    money: { total, cost: booking.get("totalCost"), profit: total - (booking.get("totalCost") as number), paid, outstanding: Math.max(total - paid, 0) },
    pendingDocuments: documents.filter((d) => d.status === "pending").length,
  });
}

/** Finds the customer account for a quote, or creates one and emails a "set your password" link. */
async function ensureCustomer(name: string, email: string) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  const token = randomToken();
  const user = await User.create({
    name,
    email,
    role: "customer",
    passwordHash: await hashPassword(randomToken(16)),
    resetTokenHash: sha256(token),
    resetTokenExpires: new Date(Date.now() + 7 * 86400000),
  });
  await emails.passwordReset(email, name, `${env.CLIENT_URL}/reset-password?token=${token}&welcome=1`);
  return user;
}

/**
 * POST /api/admin/quotes/:id/convert — "Convert an accepted quote into a confirmed booking".
 * Copies the itinerary and turns each quote line into a booking item for supplier details.
 */
export async function convertQuote(req: Request, res: Response) {
  const q = await Quote.findById(req.params.id);
  if (!q) throw ApiError.notFound("Quote not found");
  if (q.status !== "accepted") throw ApiError.badRequest("Only accepted quotes can be converted");
  if (await Booking.exists({ quote: q._id })) throw ApiError.conflict("This quote already has a booking");
  if (!q.customerEmail) throw ApiError.badRequest("The quote needs a customer email");

  const customer = q.customer ? await User.findById(q.customer) : await ensureCustomer(q.customerName ?? "Guest", q.customerEmail);
  if (!customer) throw ApiError.badRequest("Customer not found");
  if (!q.customer) {
    q.customer = customer._id;
    await q.save();
  }

  const booking = await Booking.create({
    ref: await nextReference(Booking, "OV"),
    quote: q._id,
    customer: customer._id,
    title: q.title,
    destination: q.destination,
    startDate: q.startDate,
    endDate: q.endDate,
    travellers: q.travellers,
    itinerary: q.itinerary,
    items: q.items.map((i) => ({ description: i.description, category: i.category, cost: (i.qty ?? 1) * (i.unitCost ?? 0), price: (i.qty ?? 1) * (i.unitPrice ?? 0) })),
    createdBy: req.user!.id,
  });
  created(res, booking);
}

/** Update status, itinerary, hotel, supplier details (name / reference / cost / price) per item. */
export async function updateBooking(req: Request, res: Response) {
  const b = await Booking.findById(req.params.id);
  if (!b) throw ApiError.notFound("Booking not found");
  b.set(req.body);
  await b.save();
  ok(res, b);
}
