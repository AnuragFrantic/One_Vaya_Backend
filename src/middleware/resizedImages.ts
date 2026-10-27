import path from "path";
import type { NextFunction, Request, Response } from "express";
import { IMAGES_ROOT, UPLOAD_ROOT } from "../services/storage.service";
import { imageVariant } from "../services/image.service";
import { logger } from "../utils/logger";

const CACHE_ROOT = path.join(UPLOAD_ROOT, "image-cache");

/**
 * GET /uploads/images/<file>?w=900 → a resized WebP copy (see services/image.service imageVariant).
 * Without ?w the original is served by express.static as before.
 */
export async function resizedImages(req: Request, res: Response, next: NextFunction) {
  const requested = Number(req.query.w);
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!Number.isFinite(requested) || requested <= 0) return next();

  const rel = decodeURIComponent(req.path).replace(/^\/+/, "");
  const original = path.resolve(IMAGES_ROOT, rel);
  if (!original.startsWith(IMAGES_ROOT + path.sep) || rel.split("/").some((p) => p.startsWith("."))) return next();

  try {
    const file = await imageVariant(original, CACHE_ROOT, rel, Math.min(requested, 4000));
    if (!file) return next(); // no such image → 404 below
    res.sendFile(file, { maxAge: "30d", immutable: true, headers: { "Content-Type": "image/webp" } });
  } catch (err) {
    logger.warn(`Resize failed for ${rel}: ${(err as Error).message}`);
    next(); // fall back to the original
  }
}
