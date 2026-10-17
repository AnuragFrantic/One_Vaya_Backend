import { env } from "../config/env";
import { connectDB, disconnectDB } from "../config/db";
import { logger } from "../utils/logger";
import {
  User, hashPassword, Service, Experience, HolidayPackage, Hotel, BlogPost, Faq, LegalPage,
  ChatbotKnowledge, Booking, TravelDocument, Invoice, Payment, Thread,
} from "../models";
import services from "./data/services.json";
import experiences from "./data/experiences.json";
import packages from "./data/packages.json";
import hotels from "./data/hotels.json";
import blog from "./data/blog.json";
import faqs from "./data/faqs.json";
import legal from "./data/legal.json";

/**
 * Loads the website's starting content (same as the static frontend) and the first admin.
 *   npm run seed            → content + admin (safe to re-run: upserts by slug)
 *   npm run seed -- --demo  → also a demo customer with a booking, documents, invoices
 */

const KNOWLEDGE = [
  { category: "Company", title: "About OneVaya", content: "OneVaya Travel & Tourism is a Dubai-based travel company. Travel designers plan and book flights, hotels, transfers, sightseeing, experiences, holiday packages, corporate travel, events & exhibitions, group travel, visa assistance and travel insurance. Every booking is made by a person with suppliers directly." },
  { category: "Contact", title: "Contact details", content: "Phone +971 4 000 0000 · WhatsApp +971 50 000 0000 · Email hello@onevaya.com · Business Bay, Dubai, UAE · Office hours Sunday–Friday 9:00–19:00. The website concierge is available 24/7." },
  { category: "How it works", title: "Quotes and bookings", content: "Guests send an enquiry, build a plan in the Trip Builder or use the AI Planner, then request a quote. A travel designer replies with a tailored, itemised quote, usually within one working day. Once the guest accepts, OneVaya books directly with airlines, hotels and partners and uploads all tickets and vouchers to My OneVaya." },
  { category: "Payments", title: "Payments", content: "Online payment is not available. Payment options are shared with the quote; payments are recorded by the OneVaya team and shown under Invoices & payments in My OneVaya." },
  { category: "Policies", title: "Cancellations", content: "Supplier cancellation rules apply. Most experiences can be cancelled free of charge 24–48 hours before the start time. Guests request changes or cancellations from their booking in My OneVaya; a travel designer confirms any charges first." },
];

async function upsertAll(model: { updateOne: Function }, rows: Record<string, unknown>[], key: string) {
  for (const row of rows) await model.updateOne({ [key]: row[key] }, { $set: row }, { upsert: true });
}

export async function seedAll(opts: { demo?: boolean } = { demo: true }) {
  await upsertAll(Service, services, "slug");
  await upsertAll(Experience, experiences, "slug");
  await upsertAll(HolidayPackage, packages, "slug");
  await upsertAll(Hotel, hotels, "name");
  await upsertAll(BlogPost, blog.map((p) => ({ ...p, date: new Date(p.date) })), "slug");
  await upsertAll(Faq, faqs, "q");
  await upsertAll(LegalPage, legal, "slug");
  await upsertAll(ChatbotKnowledge, KNOWLEDGE, "title");

  if (!(await User.exists({ email: env.ADMIN_EMAIL.toLowerCase() }))) {
    await User.create({ name: env.ADMIN_NAME, email: env.ADMIN_EMAIL, role: "admin", passwordHash: await hashPassword(env.ADMIN_PASSWORD) });
    logger.info(`Admin created: ${env.ADMIN_EMAIL} (change the password after first sign-in)`);
  }

  if (opts.demo) await seedDemoCustomer();
  logger.info("Seed complete.");
}

/** A demo customer that matches the sample data on the website's My OneVaya pages. */
async function seedDemoCustomer() {
  const email = "aisha.khan@example.com";
  if (await User.exists({ email })) return;
  const customer = await User.create({ name: "Aisha Khan", email, phone: "+971 50 000 0000", nationality: "United Arab Emirates", role: "customer", passwordHash: await hashPassword("Demo!2026") });

  const exp = Object.fromEntries((await Experience.find().select("slug").lean()).map((e) => [e.slug, e._id]));
  const booking = await Booking.create({
    ref: "OV-24817",
    customer: customer._id,
    title: "Family Escape to Dubai",
    destination: "Dubai, UAE",
    image: "https://images.unsplash.com/photo-1597659840241-37e2b9c2f55f?auto=format&fit=crop&w=1600&q=80",
    status: "confirmed",
    startDate: "2026-12-12",
    endDate: "2026-12-16",
    travellers: "2 adults, 1 child",
    hotel: "Downtown Signature Hotel",
    itinerary: [
      { date: "2026-12-12", title: "Arrival", items: [{ time: "14:20", text: "Arrive DXB · Emirates EK 501" }, { time: "15:30", text: "Private transfer to Downtown Signature Hotel" }] },
      { date: "2026-12-13", title: "Downtown icons", items: [{ time: "10:00", text: "Museum of the Future", experience: exp["museum-of-the-future"] }, { time: "17:30", text: "Burj Khalifa – At the Top (sunset)", experience: exp["burj-khalifa-at-the-top"] }] },
      { date: "2026-12-14", title: "The desert", items: [{ time: "15:00", text: "Evening Desert Safari, hotel pick-up", experience: exp["evening-desert-safari"] }] },
      { date: "2026-12-15", title: "Sea & sky", items: [{ time: "12:00", text: "Burj Al Arab Inside Tour", experience: exp["burj-al-arab-inside-tour"] }, { time: "20:00", text: "Marina Dinner Cruise", experience: exp["marina-dinner-cruise"] }] },
      { date: "2026-12-16", title: "Departure", items: [{ time: "11:00", text: "Hotel check-out" }, { time: "12:00", text: "Private transfer to DXB" }] },
    ],
    items: [
      { description: "Return flights EK 501 / EK 502 (3 pax)", category: "flight", supplierName: "Emirates", supplierRef: "EK7Q2L", cost: 6900, price: 7800, status: "booked" },
      { description: "Downtown Signature Hotel, 4 nights", category: "hotel", supplierName: "Downtown Signature", supplierRef: "DS-55120", cost: 3600, price: 4600, status: "booked" },
      { description: "Private airport transfers", category: "transfer", supplierName: "Desert Limo", cost: 260, price: 360, status: "booked" },
      { description: "Experiences (5) for 3 guests", category: "sightseeing", supplierName: "Various", cost: 2700, price: 3680, status: "booked" },
    ],
  });

  const docs = [
    ["Flight e-tickets · EK 501 / EK 502", "flight", "ready"],
    ["Hotel voucher · Downtown Signature Hotel", "hotel", "ready"],
    ["Airport transfer confirmations", "transfer", "ready"],
    ["Burj Khalifa tickets · 17:30", "sightseeing", "ready"],
    ["Desert Safari tickets", "sightseeing", "ready"],
    ["Marina Dinner Cruise tickets", "sightseeing", "pending"],
  ];
  // Demo documents have no real file; upload PDFs from the admin panel to replace them.
  await TravelDocument.insertMany(docs.map(([name, type, status]) => ({ booking: booking._id, customer: customer._id, name, type, status })));

  const inv1 = await Invoice.create({ no: "INV-2026-0418", booking: booking._id, customer: customer._id, date: new Date("2026-10-18"), due: new Date("2026-10-25"), items: [{ description: "Deposit", amount: 14250 }], amountAED: 14250 });
  await Invoice.create({ no: "INV-2026-0447", booking: booking._id, customer: customer._id, date: new Date("2026-11-02"), due: new Date("2026-11-20"), items: [{ description: "Balance", amount: 2190 }], amountAED: 2190 });
  await Payment.create({ booking: booking._id, invoice: inv1._id, customer: customer._id, date: new Date("2026-10-19"), method: "bank_transfer", amountAED: 14250, reference: "TRF-88213" });
  await Thread.create({
    booking: booking._id, customer: customer._id, subject: "Burj Khalifa time change", kind: "change_request", status: "open",
    messages: [
      { from: "customer", author: customer._id, name: "Aisha", text: "Could we move the Burj Khalifa visit to 19:30 instead?" },
      { from: "team", name: "Layla", text: "Of course. I've requested the 19:30 slot and will confirm shortly." },
    ],
  });
  logger.info(`Demo customer created: ${email} / Demo!2026`);
}

// Run directly: `npm run seed` (add `-- --demo` for the demo customer)
if (require.main === module) {
  (async () => {
    await connectDB();
    await seedAll({ demo: process.argv.includes("--demo") });
    await disconnectDB();
  })().catch((err) => {
    logger.error(err);
    process.exit(1);
  });
}
