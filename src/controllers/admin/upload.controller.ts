import type { Request, Response } from "express";
import { ApiError } from "../../utils/ApiError";
import { created } from "../../utils/respond";
import { keyOf, publicImageUrl } from "../../services/storage.service";

/**
 * POST /api/admin/uploads/image  (multipart: file)
 * Saves a website image (service, experience, package or blog picture) and returns its public URL,
 * which the admin panel puts into the item's `image` field.
 */
export async function uploadImage(req: Request, res: Response) {
  if (!req.file) throw ApiError.badRequest("Attach an image in the `file` field");
  const key = keyOf(req.file);
  // Use the API's real public address, so the link works even if API_URL in .env still says localhost.
  const origin = `${req.protocol}://${req.get("host")}`;
  created(res, { url: publicImageUrl(key, origin), key, size: req.file.size, mimeType: req.file.mimetype });
}
