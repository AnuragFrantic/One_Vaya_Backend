import { z } from "zod";
import {
  BOOKING_STATUSES,
  DOCUMENT_TYPES,
  LEAD_STATUSES,
  PAYMENT_METHODS,
  QUOTE_STATUSES,
  ROLES,
} from "../config/constants";

/* Request body schemas (Zod). Used with the `validate()` middleware in routes. */

const email = z.string().trim().toLowerCase().email("Enter a valid email");
const name = z.string().trim().min(2, "Enter your name").max(120);
const password = z.string().min(8, "Use at least 8 characters").max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

// ─────────────── Auth ───────────────
export const registerSchema = z.object({ name, email, password, phone: z.string().trim().max(40).optional() });
export const loginSchema = z.object({ email, password: z.string().min(1) });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(20), password });

// ─────────────── Public forms ───────────────
export const enquirySchema = z.object({
  kind: z.string().max(40).default("general"),
  service: z.string().max(120).optional(),
  fields: z.record(z.string(), z.string().max(2000)).default({}),
  website: z.string().optional(), // honeypot
});

export const planItemSchema = z.object({ uid: z.string().max(40), experience: z.string().max(120), day: z.number().int().min(0).max(30), time });
export const tripRequestSchema = z.object({
  name,
  email,
  phone: z.string().max(40).optional(),
  source: z.enum(["trip_builder", "ai_planner"]).default("trip_builder"),
  startDate: date,
  days: z.number().int().min(1).max(30),
  adults: z.number().int().min(1).max(50).default(2),
  children: z.number().int().min(0).max(50).default(0),
  items: z.array(planItemSchema).max(100),
  hotel: z.string().max(120).optional(),
  arrivalTransfer: z.boolean().optional(),
  departureTransfer: z.boolean().optional(),
  notes: z.string().max(3000).optional(),
  website: z.string().optional(),
});

export const newsletterSchema = z.object({ email, website: z.string().optional() });

// ─────────────── AI ───────────────
export const chatSchema = z.object({
  conversationId: objectId.optional(),
  visitorId: z.string().max(80).optional(),
  message: z.string().trim().min(1).max(1500),
  page: z.string().max(200).optional(),
});

export const planSchema = z.object({
  brief: z.string().trim().min(3).max(1500),
  startDate: date,
  days: z.number().int().min(1).max(14),
  group: z.string().max(40).optional(),
  budget: z.string().max(40).optional(),
  interests: z.array(z.string().max(40)).max(10).optional(),
});

export const validatePlanSchema = z.object({ startDate: date, items: z.array(planItemSchema).max(100) });

// ─────────────── Portal ───────────────
export const profileSchema = z.object({ name: name.optional(), phone: z.string().max(40).optional(), nationality: z.string().max(80).optional() });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const threadCreateSchema = z.object({
  bookingId: objectId.optional(),
  subject: z.string().trim().min(2).max(200),
  kind: z.enum(["message", "change_request"]).default("message"),
  text: z.string().trim().min(1).max(5000),
});
export const threadReplySchema = z.object({ text: z.string().trim().min(1).max(5000) });

// ─────────────── Admin ───────────────
const itineraryDay = z.object({
  date: z.string().optional(),
  title: z.string().max(200).optional(),
  items: z.array(z.object({ time: z.string().max(10).optional(), text: z.string().max(500), experience: objectId.optional() })).default([]),
});

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  followUpAt: z.coerce.date().nullable().optional(),
  assignedTo: objectId.nullable().optional(),
});
export const noteSchema = z.object({ text: z.string().trim().min(1).max(3000) });

const quoteItem = z.object({
  description: z.string().min(1).max(300),
  category: z.string().max(40).default("other"),
  qty: z.number().min(0).default(1),
  unitCost: z.number().min(0).default(0),
  unitPrice: z.number().min(0).default(0),
});
/** Fields without defaults, so a PATCH only changes what it sends. */
const quoteFields = z.object({
  leadId: objectId.optional(),
  customerId: objectId.optional(),
  customerName: z.string().max(120).optional(),
  customerEmail: email.optional(),
  title: z.string().min(2).max(200),
  destination: z.string().max(120).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  travellers: z.string().max(120).optional(),
  itinerary: z.array(itineraryDay),
  items: z.array(quoteItem),
  validUntil: z.coerce.date().optional(),
  notes: z.string().max(3000).optional(),
});
export const quoteSchema = quoteFields.extend({ itinerary: z.array(itineraryDay).default([]), items: z.array(quoteItem).default([]) });
export const quoteUpdateSchema = quoteFields.partial().extend({ status: z.enum(QUOTE_STATUSES).optional() });
export const overrideSchema = z.object({ reason: z.string().trim().min(3).max(500) });

const bookingItem = z.object({
  description: z.string().min(1).max(300),
  category: z.string().max(40).default("other"),
  supplierName: z.string().max(120).optional(),
  supplierRef: z.string().max(120).optional(),
  cost: z.number().min(0).default(0),
  price: z.number().min(0).default(0),
  status: z.enum(["pending", "booked", "cancelled"]).default("pending"),
});
export const bookingUpdateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  destination: z.string().max(120).optional(),
  image: z.string().max(500).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  startDate: date.optional(),
  endDate: date.optional(),
  travellers: z.string().max(120).optional(),
  hotel: z.string().max(200).optional(),
  itinerary: z.array(itineraryDay).optional(),
  items: z.array(bookingItem).optional(),
});

export const documentMetaSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(DOCUMENT_TYPES).default("other"),
  visibleToCustomer: z.coerce.boolean().default(true),
});
export const documentUpdateSchema = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  type: z.enum(DOCUMENT_TYPES).optional(),
  status: z.enum(["pending", "ready"]).optional(),
  visibleToCustomer: z.boolean().optional(),
});
export const pendingDocumentSchema = z.object({ name: z.string().trim().min(2).max(200), type: z.enum(DOCUMENT_TYPES).default("other") });

const invoiceFields = z.object({
  bookingId: objectId,
  date: z.coerce.date().optional(),
  due: z.coerce.date().optional(),
  items: z.array(z.object({ description: z.string().min(1).max(300), amount: z.number() })).min(1),
  notes: z.string().max(2000).optional(),
  visibleToCustomer: z.boolean(),
});
export const invoiceSchema = invoiceFields.extend({ visibleToCustomer: z.boolean().default(true) });
export const invoiceUpdateSchema = invoiceFields.omit({ bookingId: true }).partial();
export const paymentSchema = z.object({
  bookingId: objectId,
  invoiceId: objectId.optional(),
  date: z.coerce.date().optional(),
  method: z.enum(PAYMENT_METHODS).default("bank_transfer"),
  amountAED: z.number().positive(),
  reference: z.string().max(120).optional(),
  note: z.string().max(1000).optional(),
});

export const staffCreateSchema = z.object({ name, email, password, role: z.enum(["staff", "admin"]).default("staff"), phone: z.string().max(40).optional() });
export const userUpdateSchema = z.object({ role: z.enum(ROLES).optional(), isActive: z.boolean().optional(), name: name.optional(), phone: z.string().max(40).optional() });
