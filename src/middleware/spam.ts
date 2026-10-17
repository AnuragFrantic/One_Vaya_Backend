import type { Request, Response, NextFunction } from "express";

/**
 * Honeypot spam protection. Website forms include a hidden `website` field that
 * people never fill in; bots usually do. Bots get a fake success so they don't retry.
 */
export function honeypot(req: Request, res: Response, next: NextFunction) {
  if (typeof req.body?.website === "string" && req.body.website.trim() !== "") {
    return res.status(201).json({ success: true, data: { reference: "OV-L-00000" } });
  }
  if (req.body && "website" in req.body) delete req.body.website;
  next();
}
