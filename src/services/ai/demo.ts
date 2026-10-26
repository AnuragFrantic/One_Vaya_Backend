import { Booking, TravelDocument } from "../../models";
import type { ToolContext } from "./chatTools";
import { findAnswer } from "../chat/answers.service";

/**
 * The OneVaya Concierge without an AI model (OneVaya runs it this way; the Claude API is optional).
 * It answers from what the team manages in the admin panel — Chatbot knowledge, FAQs, experiences
 * and services — reads a signed-in guest's own bookings and documents, and hands over to a travel
 * designer (live in Admin → AI chats) when it can't help or the guest asks for a person.
 */
export async function demoChatReply(message: string, ctx: ToolContext): Promise<string> {
  const t = message.toLowerCase().trim();
  const personal = /\b(my|mine|i have|i booked|our)\b/.test(t);

  // Small talk
  if (/^(hi|hello|hey|salam|salaam|good (morning|afternoon|evening))\b[\s!.?]*$/.test(t)) {
    return "Hello! I'm the OneVaya concierge. Ask me about our services, Dubai experiences, policies, or your own booking.";
  }
  if (/^(thanks|thank you|thx|great|perfect|ok|okay)\b/.test(t) && t.length < 40) {
    return "You're welcome! Anything else I can help with?";
  }

  // A person, please
  if (/\b(human|person|agent|someone|call me|speak to|talk to|real person|travel designer)\b/.test(t)) {
    ctx.onHandoff?.();
    return "Of course. A OneVaya travel designer has been notified and will reply here shortly (or by email).";
  }

  // The guest's own trip
  if (personal && /voucher|ticket|document/.test(t)) {
    if (!ctx.customerId) return "Your tickets and vouchers are in My OneVaya. Sign in and I can tell you exactly which ones are ready.";
    const docs = await TravelDocument.find({ customer: ctx.customerId, visibleToCustomer: true }).lean();
    if (!docs.length) return "No documents have been uploaded yet. Your travel designer adds them once your booking is confirmed.";
    const ready = docs.filter((d) => d.status === "ready").map((d) => d.name);
    return `${ready.length} of ${docs.length} documents are ready in My OneVaya → Documents: ${ready.slice(0, 4).join(", ")}${ready.length > 4 ? "…" : ""}.`;
  }
  if (personal && /status|booking|confirmed|trip/.test(t) && !/change|modify|move|cancel/.test(t)) {
    if (!ctx.customerId) return "Sign in to My OneVaya and I can check your booking status for you.";
    const b = await Booking.findOne({ customer: ctx.customerId }).sort("-startDate").lean();
    return b ? `Your trip ${b.ref} (${b.title}) is ${b.status.replace("_", " ")}, from ${b.startDate} to ${b.endDate}.` : "I couldn't find a booking on your account yet.";
  }
  if (personal && /change|modify|move|cancel|reschedule/.test(t)) {
    ctx.onHandoff?.();
    return "I've passed your request to the OneVaya team. Your travel designer will confirm what's possible shortly. I can't change bookings myself.";
  }

  // Everything the team manages in the admin panel: Chatbot knowledge, FAQs, experiences, services
  const found = await findAnswer(message);
  if (found) return found.answer;

  if (/\d+\s*(days?|nights?)|what should i do|plan|itinerary/.test(t)) {
    return "Tell us your dates and interests and we'll plan it with you: try the AI Planner (/ai-planner) or build it day by day in the Trip Builder (/trip-builder).";
  }
  if (/price|cost|how much|rate|fee/.test(t)) {
    return "Prices and availability are confirmed by our travel designers in your quote. Each experience page shows an indicative 'from' price.";
  }

  return "I don't have an answer for that yet. Would you like me to connect you with a OneVaya travel designer? Just say \"talk to a person\".";
}
