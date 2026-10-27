/**
 * One-time clean-up: converts website images uploaded before automatic optimisation (large PNG/JPG)
 * into compact WebP files and points the content in the database at the new files.
 * The original files are kept, so any old link keeps working.
 *
 *   npm run optimize-images                         (development)
 *   node dist/scripts/optimize-images.js            (server, after npm run build)
 */
import fs from "fs/promises";
import path from "path";
import mongoose from "mongoose";
import "../models";
import { connectDB, disconnectDB } from "../config/db";
import { IMAGES_ROOT } from "../services/storage.service";
import { optimizeImage } from "../services/image.service";
import { refreshWebsite } from "../services/website.service";

async function listImages(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries.map((e) => (e.isDirectory() ? listImages(path.join(dir, e.name)) : Promise.resolve([path.join(dir, e.name)]))),
  );
  return nested.flat().filter((f) => /\.(png|jpe?g)$/i.test(f));
}

/** "/uploads/images/2026/a.png" → "/uploads/images/2026/a.webp" for every converted file, inside any string. */
function replaceLinks(value: unknown, renames: Map<string, string>): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    let next = value;
    for (const [from, to] of renames) if (next.includes(from)) next = next.split(from).join(to);
    return { value: next, changed: next !== value };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((v) => {
      const r = replaceLinks(v, renames);
      changed ||= r.changed;
      return r.value;
    });
    return { value: out, changed };
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    let changed = false;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const r = replaceLinks(v, renames);
      changed ||= r.changed;
      out[k] = r.value;
    }
    return { value: out, changed };
  }
  return { value, changed: false }; // ObjectId, Date, numbers… left untouched
}

async function main() {
  const files = await listImages(IMAGES_ROOT);
  console.log(`Found ${files.length} PNG/JPG image(s) in ${IMAGES_ROOT}`);

  const renames = new Map<string, string>();
  for (const file of files) {
    const done = file.replace(/\.[^.]+$/, ".webp");
    // Already converted on an earlier run: only make sure the links point at the WebP.
    const out = await fs.access(done).then(() => done, () => optimizeImage(file, { keepOriginal: true }));
    if (out === file) continue;
    const rel = (p: string) => "/uploads/images/" + path.relative(IMAGES_ROOT, p).split(path.sep).join("/");
    renames.set(rel(file), rel(out));
  }
  if (!renames.size) return console.log("Nothing to convert.");

  await connectDB();
  let updated = 0;
  for (const name of mongoose.modelNames()) {
    const collection = mongoose.model(name).collection;
    for await (const doc of collection.find({})) {
      const r = replaceLinks(doc, renames);
      if (!r.changed) continue;
      await collection.replaceOne({ _id: doc._id }, r.value as typeof doc);
      updated++;
    }
  }
  console.log(`Converted ${renames.size} image(s); updated links in ${updated} record(s).`);
  refreshWebsite("image optimisation");
  await new Promise((r) => setTimeout(r, 3000)); // let the website refresh call go out
  await disconnectDB();
}

main().catch(async (err) => {
  console.error("❌ Image optimisation failed:", err);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
