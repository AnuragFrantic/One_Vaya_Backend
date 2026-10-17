import { Experience } from "../../models";
import type { RuleExperience } from "./validation";

/** Loads published experiences as validation rules, keyed by slug. */
export async function loadRuleCatalog(): Promise<Map<string, RuleExperience>> {
  const rows = await Experience.find({ isPublished: true })
    .select("slug name area durationMin slots openDays cutoffHours priceAED")
    .lean();
  return new Map(
    rows.map((r) => [
      r.slug,
      {
        slug: r.slug,
        name: r.name,
        area: r.area,
        durationMin: r.durationMin,
        slots: r.slots ?? [],
        openDays: r.openDays ?? [],
        cutoffHours: r.cutoffHours ?? 24,
        priceAED: r.priceAED,
      },
    ]),
  );
}
