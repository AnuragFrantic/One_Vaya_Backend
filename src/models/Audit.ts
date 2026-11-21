import { Schema, Types, model } from "mongoose";

/**
 * Who did what in the admin panel (archive / restore / delete and similar). Kept even after the record it
 * describes is gone, so an admin can always answer "who removed this, and when?". It stores a short
 * summary, never the content itself (for chats: counts and dates, not the messages).
 */
const auditSchema = new Schema(
  {
    action: { type: String, required: true, index: true }, // e.g. "chat.archive"
    entity: { type: String, required: true }, // e.g. "chat"
    entityId: { type: Types.ObjectId, index: true },
    by: { type: Types.ObjectId, ref: "User" },
    byName: String,
    byEmail: String,
    summary: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ createdAt: -1 });

export const AuditLog = model("AuditLog", auditSchema);
