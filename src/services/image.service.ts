import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { logger } from "../utils/logger";

/** Largest side of a website image. Wide enough for a full-screen hero on a large screen. */
const MAX_SIDE = 1920;
/** WebP quality: visually the same as the original at a fraction of the size. */
const QUALITY = 80;

/**
 * Makes an uploaded website image fast to load: turns it upright (phone photos), shrinks it to at
 * most MAX_SIDE px and saves it as WebP next to the original, which is then removed.
 * A 2 MB PNG typically becomes 100–300 KB. If anything goes wrong the original is kept as it is.
 * Returns the path of the file to use.
 */
export async function optimizeImage(filePath: string, { keepOriginal = false } = {}): Promise<string> {
  const out = filePath.replace(/\.[^.\/]+$/, "") + ".webp";
  const tmp = `${out}.tmp`;
  try {
    await sharp(filePath, { failOn: "error" })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(tmp);
    const [before, after] = await Promise.all([fs.stat(filePath), fs.stat(tmp)]);
    // An already-small WebP can come out bigger; keep whichever is smaller.
    if (filePath.endsWith(".webp") && after.size >= before.size) {
      await fs.rm(tmp, { force: true });
      return filePath;
    }
    await fs.rename(tmp, out);
    if (!keepOriginal && out !== filePath) await fs.rm(filePath, { force: true });
    logger.info(`Image optimised: ${path.basename(filePath)} ${kb(before.size)} → ${path.basename(out)} ${kb(after.size)}`);
    return out;
  } catch (err) {
    await fs.rm(tmp, { force: true });
    logger.warn(`Image optimisation skipped for ${path.basename(filePath)}: ${(err as Error).message}`);
    return filePath;
  }
}

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

/** Sizes the website may ask for with ?w= (anything else snaps to the next size up). */
const VARIANT_WIDTHS = [400, 600, 900, 1200, 1600, 2000];

/**
 * Path of a smaller copy of an uploaded image for `?w=…` requests (cards don't need the full-size
 * hero). Each size is made once with sharp and kept in <UPLOAD_DIR>/image-cache, so later visitors
 * get it straight from disk. Returns null when the original doesn't exist.
 */
export async function imageVariant(original: string, cacheRoot: string, relPath: string, requested: number): Promise<string | null> {
  const width = VARIANT_WIDTHS.find((w) => w >= requested) ?? VARIANT_WIDTHS[VARIANT_WIDTHS.length - 1];
  const cached = path.join(cacheRoot, `w${width}`, relPath.replace(/\.[^.\/]+$/, "") + ".webp");
  if (await exists(cached)) return cached;
  if (!(await exists(original))) return null;
  await fs.mkdir(path.dirname(cached), { recursive: true });
  const tmp = `${cached}.${process.pid}.tmp`;
  await sharp(original).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: QUALITY }).toFile(tmp);
  await fs.rename(tmp, cached);
  return cached;
}

const exists = (p: string) => fs.access(p).then(() => true, () => false);
