import type { Request, Response } from "express";
import { Lookup } from "../../models";
import { LOOKUP_TYPES, type LookupType } from "../../models/Lookup";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import { escapeRegex } from "../../utils/helpers";
import { DEFAULT_TRAVEL_MINUTES, loadLookupCache, lookupUsage, renameLookupValue } from "../../services/lookup.service";
import { refreshWebsite } from "../../services/website.service";

/*
 * Admin "Lists": experience categories, areas (with travel time) and package regions.
 * Same response shape as the other catalogue screens (crud.factory), plus:
 *  - renaming a value renames it in every experience / hotel / package that uses it;
 *  - a value still in use can't be deleted.
 */

const isType = (v: unknown): v is LookupType => (LOOKUP_TYPES as readonly string[]).includes(v as string);

function clean(body: Record<string, unknown>, type: LookupType) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) throw ApiError.badRequest("Enter a name");
  const order = body.order === undefined || body.order === "" ? 0 : Number(body.order);
  const out: Record<string, unknown> = { type, name, order: Number.isFinite(order) ? order : 0 };
  if (type === "area") {
    const tm = body.travelMinutes === undefined || body.travelMinutes === "" ? DEFAULT_TRAVEL_MINUTES : Number(body.travelMinutes);
    if (!Number.isFinite(tm) || tm < 0 || tm > 600) throw ApiError.badRequest("Travel time must be between 0 and 600 minutes");
    out.travelMinutes = tm;
  }
  return out;
}

async function assertUnique(type: LookupType, name: string, exceptId?: string) {
  const clash = await Lookup.findOne({ type, name: new RegExp(`^${escapeRegex(name)}$`, "i"), ...(exceptId ? { _id: { $ne: exceptId } } : {}) });
  if (clash) throw ApiError.badRequest(`"${clash.name}" is already in this list`);
}

async function changed(reason: string) {
  await loadLookupCache();
  refreshWebsite(reason);
}

export async function list(req: Request, res: Response) {
  const filter: Record<string, unknown> = {};
  if (isType(req.query.type)) filter.type = req.query.type;
  if (typeof req.query.q === "string" && req.query.q.trim()) filter.name = new RegExp(escapeRegex(req.query.q.trim()), "i");
  const rows = await Lookup.find(filter).sort("type order name").lean();
  ok(res, rows, 200, { page: 1, limit: rows.length, total: rows.length });
}

export async function get(req: Request, res: Response) {
  const doc = await Lookup.findById(req.params.id).lean();
  if (!doc) throw ApiError.notFound();
  ok(res, doc);
}

export async function create(req: Request, res: Response) {
  if (!isType(req.body.type)) throw ApiError.badRequest("Choose which list this value belongs to");
  const data = clean(req.body, req.body.type);
  await assertUnique(req.body.type, data.name as string);
  const doc = await Lookup.create(data);
  await changed("list value added");
  created(res, doc);
}

export async function update(req: Request, res: Response) {
  const doc = await Lookup.findById(req.params.id);
  if (!doc) throw ApiError.notFound();
  const type = doc.type as LookupType; // a value can't move to another list
  const data = clean({ ...doc.toObject(), ...req.body }, type);
  await assertUnique(type, data.name as string, String(doc._id));
  const oldName = doc.name;
  doc.set(data);
  await doc.save();
  const renamed = oldName !== doc.name ? await renameLookupValue(type, oldName, doc.name) : 0;
  await changed("list value updated");
  ok(res, doc, 200, renamed ? { renamedRecords: renamed } : undefined);
}

export async function remove(req: Request, res: Response) {
  const doc = await Lookup.findById(req.params.id);
  if (!doc) throw ApiError.notFound();
  const used = await lookupUsage(doc.type as LookupType, doc.name);
  if (used.length) {
    const where = used.map((u) => `${u.count} ${u.label}${u.count === 1 ? "" : "s"}`).join(" and ");
    throw ApiError.badRequest(`"${doc.name}" is still used by ${where}. Change those first, or rename this value instead.`);
  }
  await doc.deleteOne();
  await changed("list value deleted");
  ok(res, { deleted: true });
}
