import type { Request, Response } from "express";
import { AuditLog } from "../../models";
import { ok } from "../../utils/respond";
import { paging } from "../../utils/helpers";

/** GET /admin/audit-log (admin only): who archived, restored or deleted what, newest first. ?entity=chat&action=chat.delete */
export async function listAudit(req: Request, res: Response) {
  const { page, limit, skip } = paging(req.query);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.entity === "string") filter.entity = req.query.entity;
  if (typeof req.query.action === "string") filter.action = req.query.action;
  const [rows, total] = await Promise.all([AuditLog.find(filter).sort("-createdAt").skip(skip).limit(limit).lean(), AuditLog.countDocuments(filter)]);
  ok(res, rows, 200, { page, limit, total });
}
