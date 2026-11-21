import { ApiError } from "./ApiError";

/*
 * Size limits for admin-managed content (services, experiences, packages, hotels, blog, FAQ, legal pages…).
 * Those screens share one create/update handler, so instead of a schema per resource these limits apply by
 * field name. Reports every problem at once, with the field path, so the admin form can mark each field.
 */

/** Titles, names and other single-line fields. */
const SHORT = new Set([
  "title", "name", "slug", "heroTitle", "heading", "category", "country", "destination", "author", "bestTime",
  "closingTime", "openingTime", "stay", "note", "q", "icon", "group", "area", "region", "duration", "label",
]);
const SHORT_MAX = 200;
/** Image and link addresses. */
const URL_KEYS = new Set(["image", "url", "link", "href"]);
const URL_MAX = 500;
/** Everything else (descriptions, article text…). */
const LONG_MAX = 10_000;
/** One entry of a list (highlights, inclusions, tags…). */
const LIST_ITEM_MAX = 2_000;
const LIST_MAX = 200;
const NUMBER_MAX = 100_000_000;

type Issue = { field: string; message: string };

function walk(value: unknown, path: string, key: string, inList: boolean, depth: number, issues: Issue[]) {
  if (issues.length >= 30) return;
  if (depth > 6) return void issues.push({ field: path, message: "Too deeply nested" });

  if (typeof value === "string") {
    if (key === "slug" && value && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      issues.push({ field: path, message: "Use lowercase letters, numbers and hyphens only (for example dubai-desert-safari)" });
    }
    const max = inList ? LIST_ITEM_MAX : URL_KEYS.has(key) ? URL_MAX : SHORT.has(key) ? SHORT_MAX : LONG_MAX;
    if (value.length > max) issues.push({ field: path, message: `Too long (${value.length.toLocaleString("en")} characters, max ${max.toLocaleString("en")})` });
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) issues.push({ field: path, message: "Enter a valid number" });
    else if (value < 0 && key !== "order") issues.push({ field: path, message: "Can't be negative" });
    else if (value > NUMBER_MAX) issues.push({ field: path, message: "Number is too large" });
    else if (key === "stars" && value > 5) issues.push({ field: path, message: "Stars must be between 0 and 5" });
  } else if (Array.isArray(value)) {
    if (value.length > LIST_MAX) issues.push({ field: path, message: `Too many items (max ${LIST_MAX})` });
    value.slice(0, LIST_MAX).forEach((v, i) => walk(v, `${path}.${i}`, key, typeof v === "string", depth + 1, issues));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, k, false, depth + 1, issues);
  }
}

/** Throws a 400 listing every field that is too long, too large or invalid. */
export function assertContentLimits(body: unknown) {
  const issues: Issue[] = [];
  walk(body, "", "", false, 0, issues);
  if (issues.length) throw ApiError.badRequest("Please check the highlighted fields", issues);
}
