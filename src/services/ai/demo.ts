import { Booking, TravelDocument } from "../../models";
import type { ToolContext } from "./chatTools";

/**
 * Demo concierge used while ANTHROPIC_API_KEY is empty. Keyword based, but it
 * reads real data (a signed-in guest's bookings and documents) so the full
 * flow can be tested end-to-end before the Claude API is purchased.
 */
export async function demoChatReply(message: string, ctx: ToolContext): Promise<string> {
  const t = message.toLowerCase();

  if (/voucher|ticket|document/.test(t)) {
    if (!ctx.customerId) return "Your tickets and vouchers are in My OneVaya. Sign in and I can tell you exactly which ones are ready.";
    const docs = await TravelDocument.find({ customer: ctx.customerId, visibleToCustomer: true }).lean();
    if (!docs.length) return "No documents have been uploaded yet. Your travel designer adds them once your booking is confirmed.";
    const ready = docs.filter((d) => d.status === "ready").map((d) => d.name);
    return `${ready.length} of ${docs.length} documents are ready in My OneVaya → Documents: ${ready.slice(0, 4).join(", ")}${ready.length > 4 ? "…" : ""}.`;
  }

  if (/status|booking|confirmed|my trip/.test(t)) {
    if (!ctx.customerId) return "Sign in to My OneVaya and I can check your booking status for you.";
    const b = await Booking.findOne({ customer: ctx.customerId }).sort("-startDate").lean();
    return b ? `Your trip ${b.ref} (${b.title}) is ${b.status}, from ${b.startDate} to ${b.endDate}.` : "I couldn't find a booking on your account yet.";
  }

  if (/change|modify|move|cancel/.test(t)) {
    ctx.onHandoff?.();
    return "I've passed your request to the OneVaya team. Your travel designer will confirm what's possible shortly.";
  }

  if (/human|person|agent|call me|speak/.test(t)) {
    ctx.onHandoff?.();
    return "Of course. A OneVaya travel designer has been notified and will reply here or by email.";
  }

  if (/\d+\s*days?|what should i do|plan|itinerary/.test(t)) {
    return "For 4 days in Dubai: Day 1 arrive and relax, Day 2 Museum of the Future and Burj Khalifa at sunset, Day 3 Evening Desert Safari, Day 4 Burj Al Arab tour and the Marina Dinner Cruise. Try the AI Planner to build it with your dates.";
  }

  if (/price|cost|how much|available/.test(t)) {
    return "Prices and availability are confirmed by our travel designers in your quote. Each experience page shows an indicative 'from' price.";
  }

  if (/desert|safari/.test(t)) {
    return "The Evening Desert Safari picks up at 15:00 and returns around 21:00, with a dune drive, sunset and dinner at camp. From AED 250 per person.";
  }

  if (/visa/.test(t)) return "Our team can guide you through UAE visa requirements. See Services → Visa Assistance or send an enquiry.";

  return "I can help with OneVaya services, Dubai sightseeing, hotels, transfers and packages, or your own booking. What would you like to know?";
}
