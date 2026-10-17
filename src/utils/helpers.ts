import crypto from "crypto";
import { Model } from "mongoose";

/** Human-friendly references, e.g. OV-L-48213 (lead), OV-Q-30418 (quote), OV-24817 (booking). */
export async function nextReference(model: Model<any>, prefix: string) {
  for (let i = 0; i < 10; i++) {
    const ref = `${prefix}-${crypto.randomInt(10000, 99999)}`;
    if (!(await model.exists({ ref }))) return ref;
  }
  return `${prefix}-${Date.now().toString().slice(-7)}`;
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-");

/** Standard list query params: ?page=1&limit=20&q=search&sort=-createdAt */
export function paging(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const sort = typeof query.sort === "string" && query.sort ? query.sort : "-createdAt";
  return { page, limit, skip: (page - 1) * limit, sort };
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");
export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => cell(r[h])).join(","))].join("\n");
}
