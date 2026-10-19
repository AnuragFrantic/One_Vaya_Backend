import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { UPLOAD_ROOT } from "../services/storage.service";

/*
 * Multer saves uploads straight to disk under UPLOAD_DIR (default ./uploads):
 *   uploads/documents/<year>/<uuid>.<ext>  → private travel documents (signed links only)
 *   uploads/images/<year>/<uuid>.<ext>     → public website images (served at /uploads/images/…)
 * File names are random and the extension comes from the checked MIME type, never from the
 * user's file name, so an upload can't become a .html or .js file.
 */

const EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

function diskStorage(folder: "documents" | "images") {
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, folder, String(new Date().getFullYear()));
      fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
    },
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${EXT[file.mimetype]}`),
  });
}

function only(types: string[], message: string): multer.Options["fileFilter"] {
  return (_req, file, cb) => (types.includes(file.mimetype) ? cb(null, true) : cb(ApiError.badRequest(message)));
}

/** Travel documents (tickets, vouchers…): PDF, or an image for scans. Field name: `file`. */
export const uploadDocument = multer({
  storage: diskStorage("documents"),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: only(["application/pdf", "image/jpeg", "image/png", "image/webp"], "Only PDF, JPG, PNG or WEBP files are allowed"),
}).single("file");

/** Website images (services, experiences, packages, blog). Field name: `file`. SVG is not accepted (it can carry scripts). */
export const uploadImage = multer({
  storage: diskStorage("images"),
  limits: { fileSize: env.MAX_IMAGE_MB * 1024 * 1024, files: 1 },
  fileFilter: only(["image/jpeg", "image/png", "image/webp"], "Only JPG, PNG or WEBP images are allowed"),
}).single("file");
