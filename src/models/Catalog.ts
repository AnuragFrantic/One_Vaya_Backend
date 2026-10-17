import { Schema, model, InferSchemaType } from "mongoose";
import { AREAS, EXPERIENCE_CATEGORIES } from "../config/constants";

/*
 * Catalogue managed by OneVaya staff in the admin panel:
 * services, attractions & experiences (with the time rules that power the
 * Trip Builder / AI validation), holiday packages and hotels.
 */

const titleText = new Schema({ title: String, text: String }, { _id: false });
const qa = new Schema({ q: String, a: String }, { _id: false });

const serviceSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    icon: String,
    group: { type: String, enum: ["travel", "specialist"], default: "travel" },
    short: String,
    heroTitle: String,
    intro: String,
    image: String,
    highlights: [titleText],
    includes: [String],
    process: [titleText],
    faqs: [qa],
    enquiry: { type: String, default: "general" },
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Service = model("Service", serviceSchema);

const experienceSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    category: { type: String, enum: EXPERIENCE_CATEGORIES, required: true },
    area: { type: String, enum: AREAS, required: true },
    image: String,
    summary: String,
    description: String,
    // ── Rules used by itinerary validation ──
    durationMin: { type: Number, required: true },
    slots: { type: [String], default: [] }, // "HH:MM"
    openDays: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] }, // 0 = Sunday
    openingTime: String,
    closingTime: String,
    cutoffHours: { type: Number, default: 24 },
    // ── Commercials ──
    priceAED: { type: Number, required: true },
    costAED: { type: Number, default: 0 }, // internal, never sent to customers
    note: String,
    highlights: [String],
    inclusions: [String],
    exclusions: [String],
    goodToKnow: [String],
    isPublished: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
experienceSchema.set("toJSON", {
  transform: (_d, ret: Record<string, unknown>) => {
    delete ret.__v;
    return ret;
  },
});
export type ExperienceAttrs = InferSchemaType<typeof experienceSchema>;
export const Experience = model("Experience", experienceSchema);

const packageSchema = new Schema(
  {
    slug: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    destination: String,
    country: String,
    region: String,
    image: String,
    nights: Number,
    priceFromAED: Number,
    tags: [String],
    summary: String,
    bestTime: String,
    stay: String,
    highlights: [String],
    itinerary: [titleText],
    inclusions: [String],
    exclusions: [String],
    isPublished: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const HolidayPackage = model("HolidayPackage", packageSchema);

const hotelSchema = new Schema(
  {
    name: { type: String, required: true },
    stars: Number,
    area: String,
    fromAED: Number,
    costAED: Number,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export const Hotel = model("Hotel", hotelSchema);
