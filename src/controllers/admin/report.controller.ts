import type { Request, Response } from "express";
import { Booking, Payment } from "../../models";
import { ok } from "../../utils/respond";
import { toCsv } from "../../utils/helpers";

/*
 * Proposal: "Sales, cost and profit reports · Reports by date range and by service · Export to Excel or CSV".
 * Date range filters on the trip start date.  ?from=2026-01-01&to=2026-12-31&format=csv
 */

async function buildReport(from?: string, to?: string) {
  const range: Record<string, string> = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  const bookings = await Booking.find({ status: { $ne: "cancelled" }, ...(from || to ? { startDate: range } : {}) })
    .populate("customer", "name")
    .lean();

  const byService: Record<string, { sales: number; cost: number; profit: number; items: number }> = {};
  const rows = bookings.map((b) => {
    const items = (b.items ?? []).filter((i) => i.status !== "cancelled");
    let sales = 0, cost = 0;
    for (const i of items) {
      sales += i.price ?? 0;
      cost += i.cost ?? 0;
      const k = i.category ?? "other";
      byService[k] ??= { sales: 0, cost: 0, profit: 0, items: 0 };
      byService[k].sales += i.price ?? 0;
      byService[k].cost += i.cost ?? 0;
      byService[k].profit += (i.price ?? 0) - (i.cost ?? 0);
      byService[k].items += 1;
    }
    return { ref: b.ref, title: b.title, customer: (b.customer as { name?: string } | null)?.name ?? "", startDate: b.startDate, status: b.status, sales, cost, profit: sales - cost };
  });

  const payments = await Payment.aggregate([
    ...(from || to ? [{ $match: { date: { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lte: new Date(to + "T23:59:59") } : {}) } } }] : []),
    { $group: { _id: null, total: { $sum: "$amountAED" } } },
  ]);

  const totals = rows.reduce((t, r) => ({ sales: t.sales + r.sales, cost: t.cost + r.cost, profit: t.profit + r.profit }), { sales: 0, cost: 0, profit: 0 });
  return { rows, byService, totals: { ...totals, bookings: rows.length, paymentsReceived: payments[0]?.total ?? 0 } };
}

export async function salesReport(req: Request, res: Response) {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const report = await buildReport(from, to);

  if (req.query.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="onevaya-sales-${from ?? "all"}-${to ?? "all"}.csv"`);
    // BOM so Excel opens UTF-8 correctly
    return res.send("﻿" + toCsv(report.rows));
  }
  ok(res, report);
}
