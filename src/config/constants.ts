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

// Experience categories, areas (with travel times) and package regions are admin-managed lists:
// see models/Lookup and services/lookup.service.

export const CURRENCY = "AED";
