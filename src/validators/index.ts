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

const email = z.string().trim().toLowerCase().max(254, "Email is too long (max 254 characters)").email("Enter a valid email address");
const name = z.string().trim().min(2, "Name must be at least 2 characters").max(120, "Name is too long (max 120 characters)");
const password = z.string().min(8, "Use at least 8 characters").max(200, "Password is too long (max 200 characters)");

/** Phone numbers: digits with an optional + and separators (space - . ( )), 7 to 14 digits in total. */
export const PHONE_MIN_DIGITS = 7;
export const PHONE_MAX_DIGITS = 14;
const phoneText = z
  .string()
  .trim()
  .max(25, "Phone number is too long")
  .refine((v) => /^\+?[\d\s().-]*$/.test(v), "Use only numbers, spaces and + - ( )")
  .refine((v) => {
    const digits = v.replace(/\D/g, "").length;
    return digits >= PHONE_MIN_DIGITS && digits <= PHONE_MAX_DIGITS;
  }, `Enter a valid phone number (${PHONE_MIN_DIGITS} to ${PHONE_MAX_DIGITS} digits)`);
/** Optional phone: a blank value is fine (clears it). */
const phone = z.union([phoneText, z.literal("")]).optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const time = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");
const objectId = z.string().regex(/^[a-f0-9]{24}$/i, "Invalid id");

// ─────────────── Auth ───────────────
export const registerSchema = z.object({ name, email, password, phone });
export const loginSchema = z.object({ email, password: z.string().min(1, "Enter your password").max(200, "Password is too long") });
export const forgotSchema = z.object({ email });
export const resetSchema = z.object({ token: z.string().min(20).max(500), password });

// ─────────────── Public forms ───────────────
/** Longest answer for an ordinary form field; the free-text message gets more room. */
const FIELD_MAX = 200;
const MESSAGE_MAX = 2000;
const MAX_FIELDS = 40;

export const enquirySchema = z
  .object({
    kind: z.string().max(40).default("general"),
    service: z.string().max(120).optional(),
    // Values are plain text from the website forms; each one is checked field by field below.
    fields: z.record(z.string().max(60), z.string().max(MESSAGE_MAX, `Too long (max ${MESSAGE_MAX} characters)`)).default({}),
    website: z.string().max(200).optional(), // honeypot
  })
  .superRefine((d, ctx) => {
    const f = d.fields;
    const bad = (key: string, message: string) => ctx.addIssue({ code: "custom", path: ["fields", key], message });
    if (Object.keys(f).length > MAX_FIELDS) return bad("fields", "Too many fields in this form");

    const fullName = (f.fullName ?? f.name ?? "").trim();
    if (!fullName) bad("fullName", "Enter your full name");
    else if (fullName.length < 2) bad("fullName", "Name must be at least 2 characters");
    else if (fullName.length > 120) bad("fullName", "Name is too long (max 120 characters)");

    const mail = (f.email ?? "").trim();
    if (!mail) bad("email", "Enter your email address");
    else if (mail.length > 254) bad("email", "Email is too long (max 254 characters)");
    else if (!z.string().email().safeParse(mail).success) bad("email", "Enter a valid email address");

    if (f.phone?.trim() && !phoneText.safeParse(f.phone).success) bad("phone", `Enter a valid phone number (${PHONE_MIN_DIGITS} to ${PHONE_MAX_DIGITS} digits)`);

    for (const [key, value] of Object.entries(f)) {
      if (key === "message" || key === "fullName" || key === "name" || key === "email" || key === "phone") continue;
      if (value.length > FIELD_MAX) bad(key, `Too long (max ${FIELD_MAX} characters)`);
    }
    // Group size is a head count.
    if (f.size !== undefined && !/^\d{1,4}$/.test(f.size.trim())) bad("size", "Enter a whole number of people");
    if (f.size !== undefined && /^\d{1,4}$/.test(f.size.trim()) && Number(f.size) < 1) bad("size", "Group size must be at least 1");
  });

export const planItemSchema = z.object({ uid: z.string().max(40), experience: z.string().max(120), day: z.number().int().min(0).max(30), time });
export const tripRequestSchema = z.object({
  name,
  email,
  phone,
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
  message: z.string().trim().min(1, "Type a message").max(1500, "Messages can be up to 1,500 characters"),
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
export const profileSchema = z.object({ name: name.optional(), phone, nationality: z.string().trim().max(80, "Too long (max 80 characters)").optional() });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: password });
export const threadCreateSchema = z.object({
  bookingId: objectId.optional(),
  subject: z.string().trim().min(2).max(200),
  kind: z.enum(["message", "change_request"]).default("message"),
  text: z.string().trim().min(1).max(5000),
});
export const threadReplySchema = z.object({ text: z.string().trim().min(1).max(5000) });

// ─────────────── Homepage slider ───────────────
/** A page on this site ("/trip-builder") or a full https link. Blocks javascript: and other schemes. */
const slideLink = z
  .string()
  .trim()
  .max(300, "Link is too long")
  .refine((v) => v === "" || /^\/(?!\/)\S*$/.test(v) || /^https:\/\/\S+$/.test(v), "Use a page on this site (starting with /, like /trip-builder) or a full https:// link");
const slideText = (max: number) => z.string().trim().max(max, `Too long (max ${max} characters)`);

// No defaults here on purpose: a partial update (e.g. only isPublished) must not reset the other fields.
const slideFields = z.object({
  eyebrow: slideText(80).optional(),
  title: z.string().trim().min(2, "Enter a headline (at least 2 characters)").max(40, "Headline is too long (max 40 characters)"),
  titleAccent: slideText(40).optional(),
  text: slideText(200).optional(),
  image: z
    .string()
    .trim()
    .min(1, "Add an image")
    .max(500, "Image address is too long")
    .refine((v) => /^https?:\/\/\S+$/.test(v) || /^\/uploads\/\S+$/.test(v), "Use an uploaded image or a full https:// image link"),
  imageAlt: slideText(150).optional(),
  primaryLabel: slideText(30).optional(),
  primaryLink: slideLink.optional(),
  secondaryLabel: slideText(30).optional(),
  secondaryLink: slideLink.optional(),
  isPublished: z.boolean().optional(),
  order: z.number().int().min(0).max(999).optional(),
});
/** A button needs both its text and its link, or neither. */
const slideButtons = (d: { primaryLabel?: string; primaryLink?: string; secondaryLabel?: string; secondaryLink?: string }, ctx: z.RefinementCtx) => {
  for (const which of ["primary", "secondary"] as const) {
    const label = (d[`${which}Label`] ?? "").trim();
    const link = (d[`${which}Link`] ?? "").trim();
    if (label && !link) ctx.addIssue({ code: "custom", path: [`${which}Link`], message: "Add the link for this button" });
    if (link && !label) ctx.addIssue({ code: "custom", path: [`${which}Label`], message: "Add the text for this button" });
  }
};
export const slideSchema = slideFields.superRefine(slideButtons);
export const slideUpdateSchema = slideFields.partial().superRefine(slideButtons);
export const slideReorderSchema = z.object({ ids: z.array(objectId).min(1).max(50) });

// ─────────────── Admin ───────────────
const itineraryDay = z.object({
  date: z.string().optional(),
  title: z.string().max(200).optional(),
  items: z.array(z.object({ time: z.string().max(10).optional(), text: z.string().max(500), experience: objectId.optional() })).default([]),
});

export const leadUpdateSchema = z.object({
  name: name.optional(),
  email: email.optional(),
  phone,
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

export const staffCreateSchema = z.object({ name, email, password, role: z.enum(["staff", "admin"]).default("staff"), phone });
export const userUpdateSchema = z.object({ role: z.enum(ROLES).optional(), isActive: z.boolean().optional(), name: name.optional(), email: email.optional(), phone });
