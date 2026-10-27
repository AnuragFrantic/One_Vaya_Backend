import type { Model } from "mongoose";
import { Experience, HolidayPackage, Hotel, Lookup } from "../models";
import { LOOKUP_TYPES, type LookupType } from "../models/Lookup";
import { logger } from "../utils/logger";

/** Starting values (what was fixed in the code before), with today's travel-time rule. */
const DEFAULTS: Record<LookupType, { name: string; travelMinutes?: number }[]> = {
  "experience-category": [{ name: "Attractions" }, { name: "Desert" }, { name: "Water" }, { name: "Culture" }, { name: "Leisure" }],
  area: [
    { name: "Downtown", travelMinutes: 35 },
    { name: "Marina", travelMinutes: 35 },
    { name: "Jumeirah", travelMinutes: 35 },
    { name: "Old Dubai", travelMinutes: 35 },
    { name: "Desert", travelMinutes: 60 },
    { name: "Abu Dhabi", travelMinutes: 90 },
  ],
  region: [{ name: "UAE" }, { name: "Indian Ocean" }, { name: "Asia" }, { name: "Europe" }],
};

/** Where each list's values are stored, so renames reach existing records. */
export const LOOKUP_USAGE: Record<LookupType, { model: Model<any>; field: string; label: string }[]> = {
  "experience-category": [{ model: Experience, field: "category", label: "experience" }],
  area: [
    { model: Experience, field: "area", label: "experience" },
    { model: Hotel, field: "area", label: "hotel" },
  ],
  region: [{ model: HolidayPackage, field: "region", label: "holiday package" }],
};

/** Travel time used for a new area until staff set one. */
export const DEFAULT_TRAVEL_MINUTES = 35;
/** Same area: short hop. */
const SAME_AREA_MINUTES = 15;

let areaMinutes = new Map<string, number>(DEFAULTS.area.map((a) => [a.name, a.travelMinutes!]));

/**
 * Minutes needed between two areas (itinerary validation): the larger of the two areas' travel
 * times, e.g. Downtown (35) → Abu Dhabi (90) = 90 min. Same rule as before, now editable.
 */
export function travelMinutes(a: string, b: string) {
  if (a === b) return SAME_AREA_MINUTES;
  return Math.max(areaMinutes.get(a) ?? DEFAULT_TRAVEL_MINUTES, areaMinutes.get(b) ?? DEFAULT_TRAVEL_MINUTES);
}

/** Reloads the travel times after an area is added, changed or removed. */
export async function loadLookupCache() {
  const areas = await Lookup.find({ type: "area" }).lean();
  areaMinutes = new Map(areas.map((a) => [a.name, a.travelMinutes ?? DEFAULT_TRAVEL_MINUTES]));
}

/**
 * Runs at start-up. Fills each list the first time (the old fixed values), and adds any value that
 * existing records already use but the list doesn't have yet, so nothing in the data is left out.
 */
export async function ensureLookups() {
  for (const type of LOOKUP_TYPES) {
    const existing = await Lookup.find({ type }).lean();
    const have = new Set(existing.map((l) => l.name.toLowerCase()));
    const add: { type: LookupType; name: string; order: number; travelMinutes?: number }[] = [];
    let order = existing.length ? Math.max(...existing.map((l) => l.order ?? 0)) + 1 : 0;
    const push = (name: string, travel?: number) => {
      if (!name || have.has(name.toLowerCase())) return;
      have.add(name.toLowerCase());
      add.push({ type, name, order: order++, ...(type === "area" ? { travelMinutes: travel ?? DEFAULT_TRAVEL_MINUTES } : {}) });
    };
    if (!existing.length) for (const d of DEFAULTS[type]) push(d.name, d.travelMinutes);
    for (const { model, field } of LOOKUP_USAGE[type]) {
      for (const v of await model.distinct(field)) if (typeof v === "string") push(v.trim());
    }
    if (add.length) {
      await Lookup.insertMany(add);
      logger.info(`Lists: added ${add.length} ${type} value(s): ${add.map((a) => a.name).join(", ")}`);
    }
  }
  await loadLookupCache();
}

/** Everything the website and admin dropdowns need, in display order. */
export async function allLookups() {
  const rows = await Lookup.find().sort("type order name").lean();
  const names = (type: LookupType) => rows.filter((r) => r.type === type).map((r) => r.name);
  return {
    categories: names("experience-category"),
    areas: rows.filter((r) => r.type === "area").map((r) => ({ name: r.name, travelMinutes: r.travelMinutes ?? DEFAULT_TRAVEL_MINUTES })),
    regions: names("region"),
  };
}

/** Records using a value, per kind (blocks deleting a value that's still in use). */
export async function lookupUsage(type: LookupType, name: string) {
  const counts = await Promise.all(LOOKUP_USAGE[type].map(async (u) => ({ label: u.label, count: await u.model.countDocuments({ [u.field]: name }) })));
  return counts.filter((c) => c.count > 0);
}

/** Renaming a value renames it in every record that uses it. Returns how many records changed. */
export async function renameLookupValue(type: LookupType, from: string, to: string) {
  let changed = 0;
  for (const { model, field } of LOOKUP_USAGE[type]) {
    const r = await model.updateMany({ [field]: from }, { $set: { [field]: to } });
    changed += r.modifiedCount;
  }
  return changed;
}
