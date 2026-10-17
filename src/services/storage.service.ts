import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env, features } from "../config/env";

/**
 * Private file storage for customer travel documents.
 *  - STORAGE_DRIVER=local → files in ./uploads, served only through signed, short-lived links
 *  - STORAGE_DRIVER=s3    → private S3-compatible bucket with pre-signed links
 * Files are never publicly listed; customers only get a link after an ownership check.
 */

const s3 = features.s3
  ? new S3Client({
      region: env.S3_REGION,
      endpoint: env.S3_ENDPOINT || undefined,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    })
  : null;

const LOCAL_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);

export async function saveFile(buffer: Buffer, originalName: string, mimeType: string, folder = "documents") {
  const ext = path.extname(originalName).toLowerCase() || ".pdf";
  const key = `${folder}/${new Date().getFullYear()}/${crypto.randomUUID()}${ext}`;
  if (s3) {
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: buffer, ContentType: mimeType }));
  } else {
    const full = path.join(LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
  }
  return key;
}

export async function deleteFile(key: string) {
  if (s3) await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
  else await fs.rm(resolveLocal(key), { force: true });
}

/** Returns a short-lived URL to download the file. Call only after checking access. */
export async function getDownloadUrl(key: string, filename: string) {
  const ttl = env.DOWNLOAD_LINK_TTL_MINUTES * 60;
  if (s3) {
    return getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ResponseContentDisposition: `attachment; filename="${filename}"` }),
      { expiresIn: ttl },
    );
  }
  const token = jwt.sign({ key, filename }, env.FILE_URL_SECRET, { expiresIn: ttl });
  return `${env.API_URL}/api/files/${encodeURIComponent(token)}`;
}

/** For local storage: verify a signed download token and return the file path. */
export function verifyLocalToken(token: string) {
  const { key, filename } = jwt.verify(token, env.FILE_URL_SECRET) as { key: string; filename: string };
  return { fullPath: resolveLocal(key), filename };
}

function resolveLocal(key: string) {
  const full = path.resolve(LOCAL_ROOT, key);
  if (!full.startsWith(LOCAL_ROOT + path.sep)) throw new Error("Invalid file key");
  return full;
}
