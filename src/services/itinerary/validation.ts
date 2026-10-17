import { travelMinutes } from "../../config/constants";

/**
 * Smart itinerary validation — the SAME rules as the website's Trip Builder
 * (Frontend/lib/itinerary.ts). The server always re-checks plans: never trust
 * what a browser (or an AI) sends.
 */

export type RuleExperience = {
  slug: string;
  name: string;
  area: string;
  durationMin: number;
  slots: string[];
  openDays: number[];
  cutoffHours: number;
  priceAED?: number;
};

export type PlanItem = { uid: string; experience: string; day: number; time: string };
export type Issue = { level: "error" | "warning"; message: string; suggestions?: string[] };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export const toTime = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export function addDays(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d;
}

export function validatePlan(
  items: PlanItem[],
  startDate: string,
  catalog: Map<string, RuleExperience>,
  now = Date.now(),
): { issues: Record<string, Issue[]>; errorCount: number } {
  const issues: Record<string, Issue[]> = {};
  const push = (id: string, i: Issue) => (issues[id] ??= []).push(i);

  for (const it of items) {
    const a = catalog.get(it.experience);
    if (!a) {
      push(it.uid, { level: "error", message: "This experience is not available." });
      continue;
    }
    const date = addDays(startDate, it.day);
    if (!a.openDays.includes(date.getDay())) {
      push(it.uid, { level: "error", message: `Not operating on ${WEEKDAYS[date.getDay()]}s. Move it to another day.` });
    }
    if (!a.slots.includes(it.time)) {
      push(it.uid, { level: "error", message: `${it.time} is not a bookable time slot.`, suggestions: a.slots });
    }
    const start = new Date(date);
    const [h, m] = it.time.split(":").map(Number);
    start.setHours(h, m);
    if (start.getTime() - now < a.cutoffHours * 3_600_000) {
      push(it.uid, { level: "warning", message: `Bookings close ${a.cutoffHours} hours before start. Our team will confirm availability.` });
    }
  }

  for (const day of new Set(items.map((i) => i.day))) {
    const list = items.filter((i) => i.day === day && catalog.has(i.experience)).sort((x, y) => toMin(x.time) - toMin(y.time));
    for (let k = 1; k < list.length; k++) {
      const prev = catalog.get(list[k - 1].experience)!;
      const cur = catalog.get(list[k].experience)!;
      const prevEnd = toMin(list[k - 1].time) + prev.durationMin;
      const need = travelMinutes(prev.area, cur.area);
      const gap = toMin(list[k].time) - prevEnd;
      const valid = cur.slots.filter((s) => toMin(s) >= prevEnd + need);
      const tail = valid.length ? "" : " Try it on another day.";
      if (gap < 0) {
        push(list[k].uid, { level: "error", message: `Overlaps with ${prev.name}, which ends around ${toTime(prevEnd)}.${tail}`, suggestions: valid.length ? valid : undefined });
      } else if (gap < need) {
        push(list[k].uid, { level: "error", message: `Only ${gap} min to travel from ${prev.area} to ${cur.area}. Allow at least ${need} min.${tail}`, suggestions: valid.length ? valid : undefined });
      }
    }
  }

  const errorCount = Object.values(issues).flat().filter((i) => i.level === "error").length;
  return { issues, errorCount };
}

/** Rule-based planner (used by the AI Planner in demo mode and as a safety net). */
export function autoPlan(wanted: string[], days: number, startDate: string, catalog: Map<string, RuleExperience>, maxPerDay = 2) {
  const PREFERRED: Record<string, string[]> = { "burj-khalifa-at-the-top": ["17:30"], "burj-al-arab-inside-tour": ["12:00"] };
  const items: PlanItem[] = [];
  const unplaced: string[] = [];
  const first = days > 2 ? 1 : 0;
  const last = days > 2 ? days - 2 : days - 1;
  let seq = 0;

  const fits = (dayItems: PlanItem[], a: RuleExperience, time: string) => {
    const start = toMin(time);
    const end = start + a.durationMin;
    return dayItems.every((it) => {
      const b = catalog.get(it.experience)!;
      const bs = toMin(it.time);
      const be = bs + b.durationMin;
      const need = travelMinutes(a.area, b.area);
      return end + need <= bs || be + need <= start;
    });
  };

  const order = wanted.filter((w) => catalog.has(w)).sort((x, y) => catalog.get(y)!.durationMin - catalog.get(x)!.durationMin);
  for (const id of order) {
    const a = catalog.get(id)!;
    const pref = PREFERRED[id] ?? [];
    const slots = [...pref, ...a.slots.filter((s) => !pref.includes(s))];
    const dayOrder = Array.from({ length: Math.max(0, last - first + 1) }, (_, i) => first + i).sort(
      (d1, d2) => items.filter((i) => i.day === d1).length - items.filter((i) => i.day === d2).length || d1 - d2,
    );
    let placed = false;
    outer: for (const slot of slots) {
      for (const day of dayOrder) {
        const dayItems = items.filter((i) => i.day === day);
        if (dayItems.length >= maxPerDay) continue;
        if (!a.openDays.includes(addDays(startDate, day).getDay())) continue;
        if (fits(dayItems, a, slot)) {
          items.push({ uid: `p${++seq}`, experience: id, day, time: slot });
          placed = true;
          break outer;
        }
      }
    }
    if (!placed) unplaced.push(id);
  }
  return { items, unplaced };
}
