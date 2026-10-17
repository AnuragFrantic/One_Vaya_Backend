import multer from "multer";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * Keeps the uploaded file in memory; the storage service then writes it to
 * local disk or S3. Travel documents are PDFs, images are allowed for scans.
 */
export const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED.includes(file.mimetype)) cb(null, true);
    else cb(ApiError.badRequest("Only PDF, JPG, PNG or WEBP files are allowed"));
  },
}).single("file");
