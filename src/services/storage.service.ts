import fs from "fs/promises";
import path from "path";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

/**
 * File storage on the server's disk (files are written by multer, see middleware/upload.ts).
 *  - Travel documents: uploads/documents/… — private, never served directly. Customers get a
 *    signed link that expires after DOWNLOAD_LINK_TTL_MINUTES, and only after an ownership check.
 *  - Website images: uploads/images/… — public, served at /uploads/images/….
 * A file's "key" is its path inside UPLOAD_DIR, e.g. "documents/2026/<uuid>.pdf".
 */

export const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);
export const IMAGES_ROOT = path.join(UPLOAD_ROOT, "images");

/** Key of a file multer has just saved. */
export function keyOf(file: Express.Multer.File) {
  return path.relative(UPLOAD_ROOT, file.path).split(path.sep).join("/");
}

export async function deleteFile(key: string) {
  await fs.rm(resolveLocal(key), { force: true });
}

/** Removes a just-uploaded file when the request fails validation afterwards. */
export async function discardUpload(file?: Express.Multer.File) {
  if (file?.path) await fs.rm(file.path, { force: true });
}

/** Short-lived link to download a private document. Call only after checking access. */
export function getDownloadUrl(key: string, filename: string) {
  const token = jwt.sign({ key, filename }, env.FILE_URL_SECRET, { expiresIn: env.DOWNLOAD_LINK_TTL_MINUTES * 60 });
  return `${env.API_URL}/api/files/${encodeURIComponent(token)}`;
}

/** Verify a signed download token and return the file path. */
export function verifyLocalToken(token: string) {
  const { key, filename } = jwt.verify(token, env.FILE_URL_SECRET) as { key: string; filename: string };
  return { fullPath: resolveLocal(key), filename };
}

/** Public URL of an uploaded website image. */
/** Public link for an uploaded image. `origin` = the address the request came in on (e.g. https://orionaiglobal.com:9877). */
export function publicImageUrl(key: string, origin = env.API_URL) {
  return `${origin.replace(/\/$/, "")}/uploads/${key}`;
}

function resolveLocal(key: string) {
  const full = path.resolve(UPLOAD_ROOT, key);
  if (!full.startsWith(UPLOAD_ROOT + path.sep)) throw new Error("Invalid file key");
  return full;
}
