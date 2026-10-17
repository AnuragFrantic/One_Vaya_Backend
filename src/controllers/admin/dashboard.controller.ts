import type { Request, Response } from "express";
import { Lead, User, Quote, Booking, Payment, Invoice, TravelDocument, Thread, ChatConversation } from "../../models";
import { ok } from "../../utils/respond";

/** GET /api/admin/dashboard — the numbers on the admin home screen (proposal: Dashboard). */
export async function dashboard(_req: Request, res: Response) {
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [enquiries, newLeads, customers, quotesSent, quotesAccepted, confirmedBookings, upcomingTrips, pendingDocuments, openThreads, handoffs, paidAgg, invoicedAgg, bookings] =
    await Promise.all([
      Lead.countDocuments(),
      Lead.countDocuments({ status: "new" }),
      User.countDocuments({ role: "customer" }),
      Quote.countDocuments({ status: "sent" }),
      Quote.countDocuments({ status: "accepted" }),
      Booking.countDocuments({ status: { $in: ["confirmed", "in_progress"] } }),
      Booking.find({ startDate: { $gte: today, $lte: in30 }, status: { $ne: "cancelled" } }).select("ref title startDate customer").populate("customer", "name").sort("startDate").limit(10).lean(),
      TravelDocument.countDocuments({ status: "pending" }),
      Thread.countDocuments({ status: "open" }),
      ChatConversation.countDocuments({ handoffRequested: true }),
      Payment.aggregate([{ $group: { _id: null, total: { $sum: "$amountAED" } } }]),
      Invoice.aggregate([{ $group: { _id: null, total: { $sum: "$amountAED" } } }]),
      Booking.find({ status: { $ne: "cancelled" } }).select("items"),
    ]);

  const sales = bookings.reduce((s, b) => s + (b.get("totalPrice") as number), 0);
  const cost = bookings.reduce((s, b) => s + (b.get("totalCost") as number), 0);
  const paid = paidAgg[0]?.total ?? 0;
  const invoiced = invoicedAgg[0]?.total ?? 0;

  ok(res, {
    enquiries, newLeads, customers, quotesSent, quotesAccepted, confirmedBookings,
    upcomingTrips, pendingDocuments, openThreads, chatHandoffs: handoffs,
    money: { sales, cost, profit: sales - cost, paymentsReceived: paid, outstanding: Math.max(invoiced - paid, 0) },
  });
}
