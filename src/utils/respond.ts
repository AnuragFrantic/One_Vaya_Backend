import type { Response } from "express";

/** Consistent success responses: `{ success: true, data, meta? }`. */
export function ok(res: Response, data: unknown, status = 200, meta?: Record<string, unknown>) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export const created = (res: Response, data: unknown) => ok(res, data, 201);
