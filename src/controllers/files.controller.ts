import type { Request, Response } from "express";
import fs from "fs";
import { verifyLocalToken } from "../services/storage.service";
import { ApiError } from "../utils/ApiError";

/**
 * GET /api/files/:token — serves a locally stored document using a signed,
 * short-lived token. Files live in UPLOAD_DIR/documents and are never served publicly.
 */
export async function serveLocalFile(req: Request, res: Response) {
  let file: { fullPath: string; filename: string };
  try {
    file = verifyLocalToken(String(req.params.token));
  } catch {
    throw ApiError.forbidden("This download link has expired. Please open it again from My OneVaya.");
  }
  if (!fs.existsSync(file.fullPath)) throw ApiError.notFound("File not found");
  res.setHeader("Cache-Control", "private, no-store");
  res.download(file.fullPath, file.filename);
}
