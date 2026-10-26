import { ChatbotKnowledge, Experience, Faq, Service } from "../../models";

/*
 * Knowledge-base answers for the concierge (no AI needed).
 * Searches what the team manages in the admin panel and returns the best matching answer:
 *   1. Chatbot knowledge entries (active)   — curated, so they rank highest
 *   2. FAQs (published)
 *   3. Experiences (published)              — answered with live duration, times, days and price
 *   4. Services (published)
 * Matching is word based: title words count most, then category, then the text itself.
 */

const STOP = new Set(
  ("a an and are any about can could do does for from get give have here hi hello how i if in is it its me my of on or our please " +
    "tell that the there their them they this to us want was we what when where which who why will with would you your yours also just " +
    "need know like there's what's i'm im be been being am some more much many very so than then too info information").split(" "),
);

/** Lowercase words without punctuation, stop words or simple plural/verb endings. */
export function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
}

type Candidate = { score: number; answer: string; source: string };

function score(query: string[], fields: { text?: string | null; weight: number }[]) {
  let total = 0;
  let strong = false; // matched in a title/question, not only in body text
  for (const q of new Set(query)) {
    let best = 0;
    for (const f of fields) {
      if (!f.text) continue;
      const ws = words(f.text);
      if (ws.includes(q)) best = Math.max(best, f.weight);
      else if (q.length >= 5 && ws.some((w) => w.startsWith(q) || (w.length >= 5 && q.startsWith(w)))) best = Math.max(best, f.weight / 2);
    }
    total += best;
    if (best >= 3) strong = true;
  }
  return { total, strong };
}

const WEEK = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const days = (open?: number[] | null) => {
  if (!open || open.length >= 7) return "every day";
  return `every day except ${WEEK.filter((_, i) => !open.includes(i)).join(" and ")}`;
};
const hours = (min: number) => (min >= 60 ? `${Number.isInteger(min / 60) ? min / 60 : (min / 60).toFixed(1)} hours` : `${min} minutes`);
const trim = (text: string, max = 700) => {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = cut.lastIndexOf(". ");
  return (end > max * 0.5 ? cut.slice(0, end + 1) : cut) + "…";
};

/** Best answer for a guest's question from the admin-managed content, or null if nothing fits. */
export async function findAnswer(message: string): Promise<{ answer: string; source: string } | null> {
  const query = words(message);
  if (!query.length) return null;

  const [kb, faqs, exps, services] = await Promise.all([
    ChatbotKnowledge.find({ isActive: true }).lean(),
    Faq.find({ isPublished: true }).lean(),
    Experience.find({ isPublished: true }).select("slug name category area summary durationMin slots openDays priceAED note").lean(),
    Service.find({ isPublished: true }).select("slug title short intro").lean(),
  ]);

  const candidates: Candidate[] = [];
  const add = (s: { total: number; strong: boolean }, boost: number, answer: string, source: string) => {
    // Needs a title/question match, or at least two matching words in the text.
    if (s.strong || s.total >= 2) candidates.push({ score: s.total * boost, answer, source });
  };

  for (const k of kb) add(score(query, [{ text: k.title, weight: 4 }, { text: k.category, weight: 3 }, { text: k.content, weight: 1 }]), 1.3, trim(k.content), `knowledge:${k.title}`);
  for (const f of faqs) add(score(query, [{ text: f.q, weight: 3 }, { text: f.category, weight: 1 }, { text: f.a, weight: 1 }]), 1.2, trim(f.a), `faq:${f.q}`);
  for (const e of exps) {
    const answer =
      `${e.name}: ${e.summary ?? ""} It takes about ${hours(e.durationMin)}` +
      (e.slots?.length ? `, with start times ${e.slots.join(", ")}` : "") +
      `, and runs ${days(e.openDays)}. From AED ${e.priceAED.toLocaleString("en-US")} per person.` +
      (e.note ? ` Note: ${e.note.replace(/\.+$/, "")}.` : "") +
      ` See /experiences/${e.slug} or add it in the Trip Builder.`;
    add(score(query, [{ text: e.name, weight: 4 }, { text: e.category, weight: 2 }, { text: e.area, weight: 2 }, { text: e.summary, weight: 1 }]), 1, answer, `experience:${e.slug}`);
  }
  for (const s of services) {
    const answer = `${s.title}: ${s.short ?? s.intro ?? ""} You can send an enquiry on the ${s.title} page (/services/${s.slug}) and a travel designer will reply with a quote.`;
    add(score(query, [{ text: s.title, weight: 4 }, { text: s.short, weight: 1 }]), 1, answer, `service:${s.slug}`);
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}
