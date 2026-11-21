import type { Request } from "express";
import type { Types } from "mongoose";
import { AuditLog } from "../models";
import { logger } from "../utils/logger";

/**
 * Records an admin action. Never throws: a failed log write must not block the action itself,
 * but it is reported so it can be noticed.
 */
export async function audit(req: Request, action: string, entity: string, entityId: Types.ObjectId | string, summary: string, meta?: Record<string, unknown>) {
  try {
    await AuditLog.create({ action, entity, entityId, by: req.user?.id, byName: req.user?.name, byEmail: req.user?.email, summary, meta });
  } catch (err) {
    logger.error(`Audit log write failed (${action}):`, err);
  }
}

/** Fields that never count as an edit. */
const NOT_AN_EDIT = new Set(["_id", "__v", "id", "createdAt", "updatedAt", "deletedAt", "deletedBy"]);

/** Names of the fields that differ between two snapshots (`doc.toObject({ virtuals: false })`) of one record. */
export function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => !NOT_AN_EDIT.has(k) && JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

/** A plain snapshot of a document, for comparing before and after an edit. */
export const snapshot = (doc: { toObject(options?: object): Record<string, unknown> }) => doc.toObject({ virtuals: false });

/**
 * Logs an edit: which fields changed (not their contents, so contact details and notes stay out of the log),
 * plus the old and new status when the status moved. Does nothing when nothing changed.
 */
export async function auditEdit(
  req: Request,
  entity: string,
  entityId: Types.ObjectId | string,
  label: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  const fields = changedFields(before, after);
  if (!fields.length) return;
  const meta: Record<string, unknown> = { fields };
  if (fields.includes("status")) meta.status = { from: before.status, to: after.status };
  await audit(req, `${entity}.update`, entity, entityId, `Edited ${entity} ${label}: ${fields.join(", ")}`, meta);
}
