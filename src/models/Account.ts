import { Schema, model, Types } from "mongoose";
import { DOCUMENT_TYPES, PAYMENT_METHODS, THREAD_KINDS, THREAD_STATUSES } from "../config/constants";

/* Everything attached to a booking: documents, invoices, payments, messages; plus chat logs. */

// ─────────────────────────── Travel documents ───────────────────────────
const documentSchema = new Schema(
  {
    booking: { type: Types.ObjectId, ref: "Booking", required: true, index: true },
    customer: { type: Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: DOCUMENT_TYPES, default: "other" },
    status: { type: String, enum: ["pending", "ready"], default: "ready" },
    fileKey: String, // path inside UPLOAD_DIR (e.g. documents/2026/<uuid>.pdf) — never exposed directly
    mimeType: String,
    size: Number,
    visibleToCustomer: { type: Boolean, default: true },
    uploadedBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
documentSchema.set("toJSON", {
  transform: (_d, ret: Record<string, unknown>) => {
    delete ret.fileKey;
    delete ret.__v;
    return ret;
  },
});
export const TravelDocument = model("TravelDocument", documentSchema);

// ─────────────────────────── Invoices & payments (manual) ───────────────────────────
const invoiceSchema = new Schema(
  {
    no: { type: String, unique: true, required: true },
    booking: { type: Types.ObjectId, ref: "Booking", required: true, index: true },
    customer: { type: Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, default: Date.now },
    due: Date,
    items: [{ _id: false, description: String, amount: Number }],
    amountAED: { type: Number, required: true },
    notes: String,
    visibleToCustomer: { type: Boolean, default: true },
    createdBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
export const Invoice = model("Invoice", invoiceSchema);

const paymentSchema = new Schema(
  {
    booking: { type: Types.ObjectId, ref: "Booking", required: true, index: true },
    invoice: { type: Types.ObjectId, ref: "Invoice" },
    customer: { type: Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: Date, default: Date.now },
    method: { type: String, enum: PAYMENT_METHODS, default: "bank_transfer" },
    amountAED: { type: Number, required: true },
    reference: String,
    note: String,
    recordedBy: { type: Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);
export const Payment = model("Payment", paymentSchema);

// ─────────────────────────── Messages & change requests ───────────────────────────
const threadSchema = new Schema(
  {
    booking: { type: Types.ObjectId, ref: "Booking", index: true },
    customer: { type: Types.ObjectId, ref: "User", required: true, index: true },
    subject: { type: String, required: true },
    kind: { type: String, enum: THREAD_KINDS, default: "message" },
    status: { type: String, enum: THREAD_STATUSES, default: "open", index: true },
    messages: [
      {
        _id: false,
        from: { type: String, enum: ["customer", "team"], required: true },
        author: { type: Types.ObjectId, ref: "User" },
        name: String,
        text: { type: String, required: true },
        at: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true },
);
export const Thread = model("Thread", threadSchema);

// ─────────────────────────── AI chat logs (for staff review) ───────────────────────────
const conversationSchema = new Schema(
  {
    customer: { type: Types.ObjectId, ref: "User", index: true },
    visitorId: { type: String, index: true },
    page: String,
    // role "staff" = a team member replying live (Socket.io takeover); `name` is shown to the guest.
    messages: [{ _id: false, role: { type: String, enum: ["user", "assistant", "staff"] }, text: String, name: String, at: { type: Date, default: Date.now } }],
    handoffRequested: { type: Boolean, default: false, index: true },
    // While a staff member has taken over, the AI does not answer.
    staffActive: { type: Boolean, default: false },
    staffMember: { type: Types.ObjectId, ref: "User" },
    mode: { type: String, enum: ["ai", "demo"], default: "demo" },
  },
  { timestamps: true },
);
export const ChatConversation = model("ChatConversation", conversationSchema);
