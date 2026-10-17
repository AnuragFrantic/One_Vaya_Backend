import type { Request, Response } from "express";
import { Booking, Invoice, Payment } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import { nextReference, paging } from "../../utils/helpers";

/*
 * Manual payments & invoices (proposal: no online payment gateway).
 * Staff record payments received; customers see invoices and payments in My OneVaya.
 */

async function bookingOr404(id: string) {
  const b = await Booking.findById(id).select("customer ref").lean();
  if (!b) throw ApiError.notFound("Booking not found");
  return b;
}

export async function listInvoices(req: Request, res: Response) {
  const { page, limit, skip } = paging(req.query);
  const filter = typeof req.query.bookingId === "string" ? { booking: req.query.bookingId } : {};
  const [rows, total] = await Promise.all([
    Invoice.find(filter).populate("booking", "ref title").populate("customer", "name email").sort("-date").skip(skip).limit(limit).lean(),
    Invoice.countDocuments(filter),
  ]);
  ok(res, rows, 200, { page, limit, total });
}

export async function createInvoice(req: Request, res: Response) {
  const { bookingId, items, ...rest } = req.body as { bookingId: string; items: { description: string; amount: number }[] };
  const b = await bookingOr404(bookingId);
  const year = new Date().getFullYear();
  const inv = await Invoice.create({
    ...rest,
    items,
    no: await nextReference(Invoice, `INV-${year}`),
    booking: b._id,
    customer: b.customer,
    amountAED: items.reduce((s, i) => s + i.amount, 0),
    createdBy: req.user!.id,
  });
  created(res, inv);
}

export async function updateInvoice(req: Request, res: Response) {
  const inv = await Invoice.findById(req.params.id);
  if (!inv) throw ApiError.notFound("Invoice not found");
  const { bookingId: _b, ...rest } = req.body;
  inv.set(rest);
  if (rest.items) inv.amountAED = (rest.items as { amount: number }[]).reduce((s, i) => s + i.amount, 0);
  await inv.save();
  ok(res, inv);
}

export async function deleteInvoice(req: Request, res: Response) {
  if (!(await Invoice.findByIdAndDelete(req.params.id))) throw ApiError.notFound("Invoice not found");
  ok(res, { deleted: true });
}

export async function listPayments(req: Request, res: Response) {
  const { page, limit, skip } = paging(req.query);
  const filter = typeof req.query.bookingId === "string" ? { booking: req.query.bookingId } : {};
  const [rows, total] = await Promise.all([
    Payment.find(filter).populate("booking", "ref title").populate("customer", "name").populate("recordedBy", "name").sort("-date").skip(skip).limit(limit).lean(),
    Payment.countDocuments(filter),
  ]);
  ok(res, rows, 200, { page, limit, total });
}

/** Record a payment received against a booking (bank transfer, card at office, cash…). */
export async function recordPayment(req: Request, res: Response) {
  const { bookingId, invoiceId, ...rest } = req.body;
  const b = await bookingOr404(bookingId);
  created(res, await Payment.create({ ...rest, booking: b._id, invoice: invoiceId, customer: b.customer, recordedBy: req.user!.id }));
}

export async function deletePayment(req: Request, res: Response) {
  if (!(await Payment.findByIdAndDelete(req.params.id))) throw ApiError.notFound("Payment not found");
  ok(res, { deleted: true });
}
