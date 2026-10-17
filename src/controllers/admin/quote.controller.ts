import type { Request, Response } from "express";
import { Quote, Lead, Experience } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import { escapeRegex, nextReference, paging } from "../../utils/helpers";
import { renderQuotePdf } from "../../services/pdf.service";
import { emails } from "../../services/email.service";
import { validatePlan, type PlanItem } from "../../services/itinerary/validation";
import { loadRuleCatalog } from "../../services/itinerary/catalog";

export async function listQuotes(req: Request, res: Response) {
  const { page, limit, skip, sort } = paging(req.query);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.status === "string") filter.status = req.query.status;
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const rx = new RegExp(escapeRegex(req.query.q.trim()), "i");
    filter.$or = [{ ref: rx }, { title: rx }, { customerName: rx }, { customerEmail: rx }];
  }
  const [rows, total] = await Promise.all([Quote.find(filter).sort(sort).skip(skip).limit(limit), Quote.countDocuments(filter)]);
  ok(res, rows, 200, { page, limit, total });
}

export async function getQuote(req: Request, res: Response) {
  const q = await Quote.findById(req.params.id).populate("lead", "ref source plan").populate("customer", "name email phone");
  if (!q) throw ApiError.notFound("Quote not found");
  ok(res, q);
}

/** Manual quote (e.g. for a phone enquiry). Usually quotes start from a lead instead. */
export async function createQuote(req: Request, res: Response) {
  const { leadId, customerId, ...rest } = req.body;
  const q = await Quote.create({ ...rest, lead: leadId, customer: customerId, ref: await nextReference(Quote, "OV-QT"), createdBy: req.user!.id });
  created(res, q);
}

/** Edit itinerary, prices (cost / price / margin), notes or status. */
export async function updateQuote(req: Request, res: Response) {
  const q = await Quote.findById(req.params.id);
  if (!q) throw ApiError.notFound("Quote not found");
  const { status, ...rest } = req.body;
  q.set(rest);
  if (status && status !== q.status) {
    q.status = status;
    if (status === "accepted" || status === "rejected") {
      q.respondedAt = new Date();
      if (q.lead) await Lead.updateOne({ _id: q.lead }, { status: status === "accepted" ? "won" : "lost" });
    }
  }
  await q.save();
  ok(res, q);
}

/**
 * POST /api/admin/quotes/:id/validate — check the quote's itinerary with the same
 * smart-validation rules. Staff can still proceed by recording an override.
 */
export async function validateQuote(req: Request, res: Response) {
  const q = await Quote.findById(req.params.id).lean();
  if (!q) throw ApiError.notFound("Quote not found");
  if (!q.startDate) throw ApiError.badRequest("Set the start date first");

  const expIds = q.itinerary.flatMap((d) => d.items.map((i) => i.experience)).filter(Boolean);
  const exps = await Experience.find({ _id: { $in: expIds } }).select("slug").lean();
  const slugById = new Map(exps.map((e) => [String(e._id), e.slug]));
  const items: PlanItem[] = q.itinerary.flatMap((d, day) =>
    d.items
      .filter((i) => i.experience && i.time && slugById.has(String(i.experience)))
      .map((i, n) => ({ uid: `${day}-${n}`, experience: slugById.get(String(i.experience))!, day, time: i.time! })),
  );
  ok(res, { ...validatePlan(items, q.startDate, await loadRuleCatalog()), checkedItems: items.length });
}

/** Proposal: "Admin staff can override a rule with a warning where required." */
export async function overrideRules(req: Request, res: Response) {
  const q = await Quote.findByIdAndUpdate(
    req.params.id,
    { $push: { ruleOverrides: { reason: req.body.reason, by: req.user!.id, at: new Date() } } },
    { new: true },
  );
  if (!q) throw ApiError.notFound("Quote not found");
  ok(res, q);
}

async function pdfFor(id: string) {
  const q = await Quote.findById(id);
  if (!q) throw ApiError.notFound("Quote not found");
  const pdf = await renderQuotePdf({
    ref: q.ref, title: q.title, customerName: q.customerName, startDate: q.startDate, endDate: q.endDate,
    travellers: q.travellers, itinerary: q.itinerary, items: q.items, notes: q.notes, validUntil: q.validUntil,
  });
  return { q, pdf };
}

/** GET /api/admin/quotes/:id/pdf — branded PDF preview/download. */
export async function quotePdf(req: Request, res: Response) {
  const { q, pdf } = await pdfFor(String(req.params.id));
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${q.ref}.pdf"`);
  res.send(pdf);
}

/** POST /api/admin/quotes/:id/send — email the PDF to the customer and mark as sent. */
export async function sendQuote(req: Request, res: Response) {
  const { q, pdf } = await pdfFor(String(req.params.id));
  if (!q.customerEmail) throw ApiError.badRequest("This quote has no customer email");
  if (!q.items.length) throw ApiError.badRequest("Add at least one priced item before sending");
  await emails.quoteSent(q.customerEmail, q.customerName ?? "there", q.ref, pdf);
  q.status = "sent";
  q.sentAt = new Date();
  await q.save();
  ok(res, q);
}
