import type { Request, Response } from "express";
import { Lead, Quote, Experience } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import { escapeRegex, nextReference, paging } from "../../utils/helpers";
import { addDays } from "../../services/itinerary/validation";

/** GET /api/admin/leads?status=new&source=trip_builder&q=aisha */
export async function listLeads(req: Request, res: Response) {
  const { page, limit, skip, sort } = paging(req.query);
  const filter: Record<string, unknown> = {};
  for (const k of ["status", "source"] as const) if (typeof req.query[k] === "string") filter[k] = req.query[k];
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const rx = new RegExp(escapeRegex(req.query.q.trim()), "i");
    filter.$or = [{ name: rx }, { email: rx }, { ref: rx }, { phone: rx }];
  }
  const [rows, total] = await Promise.all([
    Lead.find(filter).sort(sort).skip(skip).limit(limit).populate("assignedTo", "name").lean(),
    Lead.countDocuments(filter),
  ]);
  ok(res, rows, 200, { page, limit, total });
}

export async function getLead(req: Request, res: Response) {
  const lead = await Lead.findById(req.params.id).populate("customer", "name email phone").populate("assignedTo", "name").populate("notes.by", "name").lean();
  if (!lead) throw ApiError.notFound("Lead not found");
  const quotes = await Quote.find({ lead: lead._id }).select("ref status title createdAt").lean();
  ok(res, { ...lead, quotes });
}

export async function updateLead(req: Request, res: Response) {
  const lead = await Lead.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!lead) throw ApiError.notFound("Lead not found");
  ok(res, lead);
}

export async function addNote(req: Request, res: Response) {
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw ApiError.notFound("Lead not found");
  lead.notes.push({ text: req.body.text, by: req.user!.id, at: new Date() });
  if (lead.status === "new") lead.status = "contacted";
  await lead.save();
  ok(res, lead);
}

/**
 * POST /api/admin/leads/:id/quote — start a draft quote from a lead.
 * Trip Builder / AI plans are copied into the quote's day-wise itinerary
 * and each experience becomes a priced line the staff can edit.
 */
export async function createQuoteFromLead(req: Request, res: Response) {
  const lead = await Lead.findById(req.params.id);
  if (!lead) throw ApiError.notFound("Lead not found");

  type PlanItem = { experience: string; day: number; time: string };
  const plan = lead.plan as { startDate?: string; days?: number; adults?: number; children?: number; items?: PlanItem[] } | undefined;
  const itinerary: { date: string; title: string; items: { time: string; text: string; experience?: unknown }[] }[] = [];
  const items: { description: string; category: string; qty: number; unitCost: number; unitPrice: number }[] = [];

  if (plan?.startDate && plan.days) {
    const exps = await Experience.find({ slug: { $in: (plan.items ?? []).map((i) => i.experience) } }).lean();
    const bySlug = new Map(exps.map((e) => [e.slug, e]));
    const pax = (plan.adults ?? 1) + (plan.children ?? 0);
    for (let d = 0; d < plan.days; d++) {
      const dayItems = (plan.items ?? []).filter((i) => i.day === d).sort((a, b) => a.time.localeCompare(b.time));
      itinerary.push({
        date: addDays(plan.startDate, d).toISOString().slice(0, 10),
        title: d === 0 ? "Arrival" : d === plan.days - 1 ? "Departure" : `Day ${d + 1}`,
        items: dayItems.map((i) => ({ time: i.time, text: bySlug.get(i.experience)?.name ?? i.experience, experience: bySlug.get(i.experience)?._id })),
      });
    }
    for (const i of plan.items ?? []) {
      const e = bySlug.get(i.experience);
      if (e) items.push({ description: e.name, category: "sightseeing", qty: pax, unitCost: e.costAED ?? 0, unitPrice: e.priceAED });
    }
  }

  const start = plan?.startDate;
  const quote = await Quote.create({
    ref: await nextReference(Quote, "OV-QT"),
    lead: lead._id,
    customer: lead.customer,
    customerName: lead.name,
    customerEmail: lead.email,
    title: `Trip for ${lead.name}`,
    destination: "Dubai, UAE",
    startDate: start,
    endDate: start && plan?.days ? addDays(start, plan.days - 1).toISOString().slice(0, 10) : undefined,
    travellers: plan ? `${plan.adults ?? 1} adults${plan.children ? `, ${plan.children} children` : ""}` : undefined,
    itinerary,
    items,
    createdBy: req.user!.id,
  });
  lead.status = "quoted";
  await lead.save();
  created(res, quote);
}
