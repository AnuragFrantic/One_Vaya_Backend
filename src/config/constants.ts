/** Shared enums and business constants. */

export const ROLES = ["customer", "staff", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const LEAD_STATUSES = ["new", "contacted", "quoted", "won", "lost"] as const;
export const LEAD_SOURCES = ["enquiry", "trip_builder", "ai_planner", "chatbot", "contact"] as const;

export const QUOTE_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"] as const;

export const BOOKING_STATUSES = ["confirmed", "in_progress", "completed", "cancelled"] as const;

export const DOCUMENT_TYPES = ["flight", "hotel", "transfer", "sightseeing", "event", "invoice", "other"] as const;

export const PAYMENT_METHODS = ["bank_transfer", "card_at_office", "cash", "cheque", "other"] as const;

export const THREAD_KINDS = ["message", "change_request"] as const;
export const THREAD_STATUSES = ["open", "resolved"] as const;

export const AREAS = ["Downtown", "Marina", "Desert", "Jumeirah", "Old Dubai", "Abu Dhabi"] as const;
export type Area = (typeof AREAS)[number];

export const EXPERIENCE_CATEGORIES = ["Attractions", "Desert", "Water", "Culture", "Leisure"] as const;

/**
 * Minutes needed to travel between two areas. Used by the itinerary validation.
 * Kept in code for launch; can move to an admin-editable setting later.
 */
export function travelMinutes(a: string, b: string) {
  if (a === b) return 15;
  if (a === "Abu Dhabi" || b === "Abu Dhabi") return 90;
  if (a === "Desert" || b === "Desert") return 60;
  return 35;
}

export const CURRENCY = "AED";
