import type { Request, Response } from "express";
import { Lead, User } from "../models";
import { created, ok } from "../utils/respond";
import { ApiError } from "../utils/ApiError";
import { nextReference } from "../utils/helpers";
import { emails } from "../services/email.service";
import { validatePlan } from "../services/itinerary/validation";
import { loadRuleCatalog } from "../services/itinerary/catalog";

/*
 * Every website form becomes a Lead in the admin panel
 * (proposal: "Every enquiry goes straight into the admin panel as a lead").
 */

async function customerIdFor(req: Request, email: string) {
  if (req.user?.role === "customer") return req.user.id;
  const u = await User.findOne({ email, role: "customer" }).select("_id").lean();
  return u?._id;
}

/** POST /api/enquiries — service, experience, package and contact forms. */
export async function createEnquiry(req: Request, res: Response) {
  const { kind, service, fields } = req.body as { kind: string; service?: string; fields: Record<string, string> };
  const name = (fields.fullName ?? fields.name ?? "").trim();
  const email = (fields.email ?? "").trim().toLowerCase();
  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email)) throw ApiError.badRequest("Name and a valid email are required");

  const { fullName: _n, name: _n2, email: _e, phone, message, ...rest } = fields;
  const ref = await nextReference(Lead, "OV-L");
  const lead = await Lead.create({
    ref,
    source: kind === "contact" ? "contact" : "enquiry",
    name,
    email,
    phone,
    message,
    service,
    fields: { kind, ...rest },
    customer: await customerIdFor(req, email),
  });

  await Promise.all([emails.enquiryReceived(email, name, ref), emails.newLeadForTeam(ref, lead.source, name, email)]);
  created(res, { reference: ref });
}

/**
 * POST /api/trip-requests — complete plan from the Trip Builder or AI Planner.
 * The plan is re-validated on the server; timing problems are stored on the lead
 * so staff can see them (staff may override rules when quoting).
 */
export async function createTripRequest(req: Request, res: Response) {
  const b = req.body;
  const catalog = await loadRuleCatalog();
  const { issues, errorCount } = validatePlan(b.items, b.startDate, catalog);

  const ref = await nextReference(Lead, "OV-Q");
  await Lead.create({
    ref,
    source: b.source,
    name: b.name,
    email: b.email,
    phone: b.phone,
    message: b.notes,
    plan: {
      startDate: b.startDate, days: b.days, adults: b.adults, children: b.children, hotel: b.hotel,
      arrivalTransfer: b.arrivalTransfer, departureTransfer: b.departureTransfer, items: b.items, issues,
    },
    planIssues: errorCount,
    customer: await customerIdFor(req, b.email),
  });

  await Promise.all([emails.enquiryReceived(b.email, b.name, ref), emails.newLeadForTeam(ref, b.source, b.name, b.email)]);
  created(res, { reference: ref, errorCount });
}

/** POST /api/itinerary/validate — lets the website check a plan against the live rules. */
export async function validateItinerary(req: Request, res: Response) {
  const catalog = await loadRuleCatalog();
  ok(res, validatePlan(req.body.items, req.body.startDate, catalog));
}
