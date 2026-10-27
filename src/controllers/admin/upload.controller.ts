import fs from "fs/promises";
import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { created } from "../../utils/respond";
import { keyOf, publicImageUrl } from "../../services/storage.service";
import { optimizeImage } from "../../services/image.service";

/**
 * POST /api/admin/uploads/image  (multipart: file)
 * Saves a website image (service, experience, package or blog picture), converts it to a compact
 * WebP (services/image.service) and returns its public URL,
 * which the admin panel puts into the item's `image` field.
 */
export async function uploadImage(req: Request, res: Response) {
  if (!req.file) throw ApiError.badRequest("Attach an image in the `file` field");
  // Shrink to a fast-loading WebP before handing out the link.
  req.file.path = await optimizeImage(req.file.path);
  req.file.mimetype = req.file.path.endsWith(".webp") ? "image/webp" : req.file.mimetype;
  req.file.size = (await fs.stat(req.file.path)).size;
  const key = keyOf(req.file);
  // Use the API's real public address, so the link works even if API_URL in .env still says localhost.
  const origin = `${req.protocol}://${req.get("host")}`;
  created(res, { url: publicImageUrl(key, origin), key, size: req.file.size, mimeType: req.file.mimetype });
}
