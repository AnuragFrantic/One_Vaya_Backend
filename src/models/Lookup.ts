import { Schema, model } from "mongoose";

/*
 * Lists staff manage in the admin panel ("Lists" screen) instead of fixed values in the code:
 *   experience-category → Experience.category (website filter chips, AI planner interests)
 *   area                → Experience.area, Hotel.area (travel time between activities)
 *   region              → HolidayPackage.region (holidays filter)
 */
export const LOOKUP_TYPES = ["experience-category", "area", "region"] as const;
export type LookupType = (typeof LOOKUP_TYPES)[number];

const lookupSchema = new Schema(
  {
    type: { type: String, enum: LOOKUP_TYPES, required: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    order: { type: Number, default: 0 },
    // Areas only: minutes needed to reach this area from another one (the larger of the two applies).
    travelMinutes: { type: Number, min: 0, max: 600 },
  },
  { timestamps: true },
);
lookupSchema.index({ type: 1, name: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });

export const Lookup = model("Lookup", lookupSchema);
