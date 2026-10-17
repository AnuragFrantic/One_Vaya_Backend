import { Schema, model, Types, InferSchemaType } from "mongoose";
import { LEAD_SOURCES, LEAD_STATUSES, QUOTE_STATUSES, BOOKING_STATUSES } from "../config/constants";

/*
 * The core workflow from the proposal:
 *   Enquiry / Trip Builder / AI plan  →  Lead  →  Quote  →  Booking
 */

/** A day-wise itinerary, shared by trip requests, quotes and bookings. */
export const itineraryDaySchema = new Schema(
  {
    date: String, // YYYY-MM-DD
    title: String,
    items: [
      {
        _id: false,
        time: String, // HH:MM
        text: String,
        experience: { type: Types.ObjectId, ref: "Experience" },
      },
    ],
  },
  { _id: false },
);

const noteSchema = new Schema(
  { text: String, by: { type: Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now } },
  { _id: false },
);

// ─────────────────────────── Lead ───────────────────────────
const leadSchema = new Schema(
  {
    ref: { type: String, unique: true, required: true },
    source: { type: String, enum: LEAD_SOURCES, default: "enquiry", index: true },
    status: { type: String, enum: LEAD_STATUSES, default: "new", index: true },
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    phone: String,
    customer: { type: Types.ObjectId, ref: "User", index: true }, // linked automatically by email
    service: String, // service / experience / package slug the enquiry came from
    fields: { type: Schema.Types.Mixed, default: {} }, // form-specific answers
    message: String,
    plan: { type: Schema.Types.Mixed }, // Trip Builder / AI plan as submitted
    planIssues: { type: Number, default: 0 }, // timing errors found by server validation
    notes: [noteSchema],
    followUpAt: Date,
    assignedTo: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
export const Lead = model("Lead", leadSchema);

// ─────────────────────────── Quote ───────────────────────────
const quoteItemSchema = new Schema(
  {
    description: { type: String, required: true },
    category: { type: String, default: "other" }, // flight, hotel, transfer, sightseeing…
    qty: { type: Number, default: 1 },
    unitCost: { type: Number, default: 0 }, // internal
    unitPrice: { type: Number, default: 0 }, // shown to customer
  },
  { _id: true },
);

const quoteSchema = new Schema(
  {
    ref: { type: String, unique: true, required: true },
    lead: { type: Types.ObjectId, ref: "Lead" },
    customer: { type: Types.ObjectId, ref: "User", index: true },
    customerName: String,
    customerEmail: String,
    title: { type: String, required: true },
    destination: String,
    startDate: String,
    endDate: String,
    travellers: String,
    itinerary: [itineraryDaySchema],
    items: [quoteItemSchema],
    currency: { type: String, default: "AED" },
    status: { type: String, enum: QUOTE_STATUSES, default: "draft", index: true },
    validUntil: Date,
    notes: String, // shown on the PDF
    ruleOverrides: [{ _id: false, reason: String, by: { type: Types.ObjectId, ref: "User" }, at: Date }],
    sentAt: Date,
    respondedAt: Date,
    createdBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
quoteSchema.virtual("totalPrice").get(function () {
  return (this.items ?? []).reduce((s, i) => s + (i.qty ?? 1) * (i.unitPrice ?? 0), 0);
});
quoteSchema.virtual("totalCost").get(function () {
  return (this.items ?? []).reduce((s, i) => s + (i.qty ?? 1) * (i.unitCost ?? 0), 0);
});
export type QuoteAttrs = InferSchemaType<typeof quoteSchema>;
export const Quote = model("Quote", quoteSchema);

// ─────────────────────────── Booking ───────────────────────────
const bookingItemSchema = new Schema({
  description: { type: String, required: true },
  category: { type: String, default: "other" },
  supplierName: String,
  supplierRef: String,
  cost: { type: Number, default: 0 },
  price: { type: Number, default: 0 },
  status: { type: String, enum: ["pending", "booked", "cancelled"], default: "pending" },
});

const bookingSchema = new Schema(
  {
    ref: { type: String, unique: true, required: true },
    quote: { type: Types.ObjectId, ref: "Quote" },
    customer: { type: Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true },
    destination: String,
    image: String,
    status: { type: String, enum: BOOKING_STATUSES, default: "confirmed", index: true },
    startDate: String,
    endDate: String,
    travellers: String,
    hotel: String,
    itinerary: [itineraryDaySchema],
    items: [bookingItemSchema],
    createdBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);
bookingSchema.virtual("totalPrice").get(function () {
  return (this.items ?? []).filter((i) => i.status !== "cancelled").reduce((s, i) => s + (i.price ?? 0), 0);
});
bookingSchema.virtual("totalCost").get(function () {
  return (this.items ?? []).filter((i) => i.status !== "cancelled").reduce((s, i) => s + (i.cost ?? 0), 0);
});
export const Booking = model("Booking", bookingSchema);
