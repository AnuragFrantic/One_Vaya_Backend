import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { Booking, Experience, HolidayPackage, Service, Thread, TravelDocument } from "../../models";
import { escapeRegex } from "../../utils/helpers";

/**
 * Tools the chatbot can call. Each one returns ONLY OneVaya-approved data.
 * The customer's identity always comes from the server session (ctx.customerId),
 * never from the model — so a guest can only ever see their own bookings.
 */
export type ToolContext = { customerId?: string; customerName?: string; conversationId?: string; onHandoff?: () => void };

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});

const PUBLIC_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_catalog",
    description: "Search OneVaya's approved services, attractions/experiences and holiday packages. Use for any question about what OneVaya offers.",
    input_schema: obj({ query: { type: "string", description: "Keywords, e.g. 'desert safari', 'family', 'Maldives'" } }, ["query"]),
    strict: true,
  },
  {
    name: "get_experience",
    description: "Get details for one experience by slug: duration, time slots, operating days, indicative price, inclusions.",
    input_schema: obj({ slug: { type: "string" } }, ["slug"]),
    strict: true,
  },
  {
    name: "request_human",
    description: "Hand the conversation to a OneVaya travel designer when the guest asks for a person or you cannot help.",
    input_schema: obj({ reason: { type: "string" } }, ["reason"]),
    strict: true,
  },
];

const CUSTOMER_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_my_bookings",
    description: "List the signed-in guest's trips with reference, dates and status.",
    input_schema: obj({}),
    strict: true,
  },
  {
    name: "get_booking_details",
    description: "Day-wise itinerary and status for one of the signed-in guest's bookings.",
    input_schema: obj({ ref: { type: "string", description: "Booking reference, e.g. OV-24817" } }, ["ref"]),
    strict: true,
  },
  {
    name: "get_my_documents",
    description: "List the signed-in guest's travel documents (tickets, vouchers, confirmations) and whether each is ready.",
    input_schema: obj({}),
    strict: true,
  },
  {
    name: "create_change_request",
    description: "Send a change request for one of the guest's bookings to the OneVaya team.",
    input_schema: obj({ ref: { type: "string" }, request: { type: "string" } }, ["ref", "request"]),
    strict: true,
  },
];

export const chatTools = (signedIn: boolean) => (signedIn ? [...PUBLIC_TOOLS, ...CUSTOMER_TOOLS] : PUBLIC_TOOLS);

const daysLabel = (d: number[]) => {
  if (d.length === 7) return "daily";
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return "closed " + [0, 1, 2, 3, 4, 5, 6].filter((x) => !d.includes(x)).map((x) => names[x]).join(", ");
};

/** Runs one tool call. Returns a JSON string for the tool_result. Throws on bad input. */
export async function runChatTool(name: string, input: unknown, ctx: ToolContext): Promise<string> {
  const needCustomer = () => {
    if (!ctx.customerId) throw new Error("The guest is not signed in.");
    return ctx.customerId;
  };

  switch (name) {
    case "search_catalog": {
      const { query } = z.object({ query: z.string().min(1).max(100) }).parse(input);
      const words = query.split(/\s+/).filter((w) => w.length > 2).map(escapeRegex);
      const rx = new RegExp(words.join("|") || escapeRegex(query), "i");
      const [exps, pkgs, svcs] = await Promise.all([
        Experience.find({ isPublished: true, $or: [{ name: rx }, { summary: rx }, { category: rx }, { area: rx }] }).limit(6).lean(),
        HolidayPackage.find({ isPublished: true, $or: [{ title: rx }, { destination: rx }, { country: rx }, { tags: rx }, { summary: rx }] }).limit(4).lean(),
        Service.find({ isPublished: true, $or: [{ title: rx }, { short: rx }] }).limit(4).lean(),
      ]);
      return JSON.stringify({
        experiences: exps.map((e) => ({ slug: e.slug, name: e.name, area: e.area, summary: e.summary, fromAED: e.priceAED, link: `/experiences/${e.slug}` })),
        packages: pkgs.map((p) => ({ title: p.title, nights: p.nights, fromAED: p.priceFromAED, summary: p.summary, link: `/holidays/${p.slug}` })),
        services: svcs.map((s) => ({ title: s.title, summary: s.short, link: `/services/${s.slug}` })),
      });
    }
    case "get_experience": {
      const { slug } = z.object({ slug: z.string() }).parse(input);
      const e = await Experience.findOne({ slug, isPublished: true }).lean();
      if (!e) return JSON.stringify({ error: "Not found in the OneVaya catalogue." });
      return JSON.stringify({
        name: e.name, area: e.area, durationMin: e.durationMin, slots: e.slots, operates: daysLabel(e.openDays ?? []),
        hours: `${e.openingTime ?? ""}–${e.closingTime ?? ""}`, fromAED: e.priceAED, note: e.note,
        inclusions: e.inclusions, exclusions: e.exclusions, goodToKnow: e.goodToKnow, link: `/experiences/${e.slug}`,
      });
    }
    case "request_human": {
      ctx.onHandoff?.();
      return JSON.stringify({ ok: true, message: "A travel designer has been notified and will reply here or by email." });
    }
    case "get_my_bookings": {
      const bookings = await Booking.find({ customer: needCustomer() }).sort("-startDate").limit(10).lean();
      return JSON.stringify(bookings.map((b) => ({ ref: b.ref, title: b.title, status: b.status, startDate: b.startDate, endDate: b.endDate })));
    }
    case "get_booking_details": {
      const { ref } = z.object({ ref: z.string() }).parse(input);
      const b = await Booking.findOne({ ref: ref.toUpperCase(), customer: needCustomer() }).lean();
      if (!b) return JSON.stringify({ error: "No booking with that reference on this account." });
      return JSON.stringify({ ref: b.ref, title: b.title, status: b.status, hotel: b.hotel, startDate: b.startDate, endDate: b.endDate, itinerary: b.itinerary });
    }
    case "get_my_documents": {
      const docs = await TravelDocument.find({ customer: needCustomer(), visibleToCustomer: true }).populate("booking", "ref").lean();
      return JSON.stringify({
        documents: docs.map((d) => ({ name: d.name, type: d.type, status: d.status, booking: (d.booking as { ref?: string } | null)?.ref })),
        whereToDownload: "My OneVaya → Documents",
      });
    }
    case "create_change_request": {
      const { ref, request } = z.object({ ref: z.string(), request: z.string().min(3).max(2000) }).parse(input);
      const customer = needCustomer();
      const b = await Booking.findOne({ ref: ref.toUpperCase(), customer }).select("_id ref").lean();
      if (!b) return JSON.stringify({ error: "No booking with that reference on this account." });
      const t = await Thread.create({
        booking: b._id, customer, subject: `Change request (via concierge) – ${b.ref}`, kind: "change_request",
        messages: [{ from: "customer", author: customer, name: ctx.customerName, text: request }],
      });
      return JSON.stringify({ ok: true, requestId: String(t._id), message: "Sent to the travel designer, who will confirm what's possible." });
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}
