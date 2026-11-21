import type { Request, Response } from "express";
import type { Model, Types } from "mongoose";
import { Booking, Invoice, Lead, Payment, Quote, Thread, TravelDocument, User } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok } from "../../utils/respond";
import { audit } from "../../services/audit.service";

/*
 * Delete, restore and Trash for the business records. A delete only marks the record (see models/softDelete),
 * so it can be brought back; nothing here removes data for good. Admins only (see the routes).
 */

type Doc = { _id: Types.ObjectId; [key: string]: any };
type Spec = {
  entity: string; // used in the audit log, e.g. "lead.delete"
  model: Model<any>;
  ref: (d: Doc) => string; // short identifier, shown in the log and the Trash
  title: (d: Doc) => string; // what the person sees in the Trash
  /** Why this record can't be deleted right now (it is still needed by other records). */
  blocker?: (d: Doc, req: Request) => Promise<string | undefined>;
  /** Why this record can't be restored right now. */
  restoreBlocker?: (d: Doc) => Promise<string | undefined>;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0]);

/** Money records point at a booking: they can only come back while that booking exists. */
const needsBooking = async (d: Doc) => ((await Booking.exists({ _id: d.booking })) ? undefined : "Restore the booking first.");

const SPECS: Record<string, Spec> = {
  leads: { entity: "lead", model: Lead, ref: (d) => d.ref, title: (d) => `${d.name} (${d.email})` },
  quotes: {
    entity: "quote",
    model: Quote,
    ref: (d) => d.ref,
    title: (d) => d.title,
    blocker: async (d) => {
      const booking = await Booking.findOne({ quote: d._id }).select("ref").lean();
      return booking ? `This quote became booking ${booking.ref}. Delete that booking first.` : undefined;
    },
  },
  bookings: {
    entity: "booking",
    model: Booking,
    ref: (d) => d.ref,
    title: (d) => d.title,
    blocker: async (d) => {
      const [invoices, payments, documents] = await Promise.all([
        Invoice.countDocuments({ booking: d._id }),
        Payment.countDocuments({ booking: d._id }),
        TravelDocument.countDocuments({ booking: d._id }),
      ]);
      const parts = [invoices && plural(invoices, "invoice"), payments && plural(payments, "payment"), documents && plural(documents, "document")].filter(Boolean) as string[];
      return parts.length ? `This booking still has ${list(parts)}. Remove them first, so nothing is left without a booking.` : undefined;
    },
  },
  users: {
    entity: "user",
    model: User,
    ref: (d) => d.email,
    title: (d) => `${d.name} · ${d.role}${d.isActive ? "" : " · inactive"}`,
    blocker: async (d, req) => {
      if (String(d._id) === req.user!.id) return "You can't delete your own account.";
      if (d.role === "admin") {
        const others = await User.countDocuments({ role: "admin", isActive: true, _id: { $ne: d._id } });
        if (!others) return "This is the only active admin. Make another admin first.";
      }
      if (d.role === "customer") {
        const [bookings, quotes] = await Promise.all([Booking.countDocuments({ customer: d._id }), Quote.countDocuments({ customer: d._id })]);
        const parts = [bookings && plural(bookings, "booking"), quotes && plural(quotes, "quote")].filter(Boolean) as string[];
        if (parts.length) return `This customer has ${list(parts)}. Their history must stay readable, so mark the account inactive instead.`;
      }
      return undefined;
    },
  },
  threads: { entity: "thread", model: Thread, ref: (d) => String(d._id).slice(-6), title: (d) => d.subject },
  invoices: {
    entity: "invoice",
    model: Invoice,
    ref: (d) => d.no,
    title: (d) => `${d.no} · AED ${d.amountAED}`,
    blocker: async (d) => {
      const n = await Payment.countDocuments({ invoice: d._id });
      return n ? `${plural(n, "payment")} ${n === 1 ? "is" : "are"} recorded against this invoice. Remove ${n === 1 ? "it" : "them"} first.` : undefined;
    },
    restoreBlocker: needsBooking,
  },
  payments: {
    entity: "payment",
    model: Payment,
    ref: (d) => String(d._id).slice(-6),
    title: (d) => `AED ${d.amountAED} · ${d.method}${d.reference ? ` · ${d.reference}` : ""}`,
    restoreBlocker: needsBooking,
  },
};

const specFor = (name: string) => {
  const spec = SPECS[name];
  if (!spec) throw ApiError.notFound("Unknown record type");
  return spec;
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** DELETE /admin/records/:entity/:id */
export async function removeRecord(req: Request, res: Response) {
  const spec = specFor(String(req.params.entity));
  const doc = (await spec.model.findById(req.params.id)) as Doc | null;
  if (!doc) throw ApiError.notFound(`${cap(spec.entity)} not found`);
  const why = await spec.blocker?.(doc, req);
  if (why) throw new ApiError(409, why);
  doc.set({ deletedAt: new Date(), deletedBy: req.user!.id });
  await doc.save({ validateModifiedOnly: true });
  await audit(req, `${spec.entity}.delete`, spec.entity, doc._id, `Deleted ${spec.entity} ${spec.ref(doc)}`, { ref: spec.ref(doc) });
  ok(res, { deleted: true });
}

/** POST /admin/records/:entity/:id/restore */
export async function restoreRecord(req: Request, res: Response) {
  const spec = specFor(String(req.params.entity));
  const doc = (await spec.model.findOne({ _id: req.params.id, deletedAt: { $ne: null } })) as Doc | null;
  if (!doc) throw ApiError.notFound(`Deleted ${spec.entity} not found`);
  const why = await spec.restoreBlocker?.(doc);
  if (why) throw new ApiError(409, why);
  doc.set({ deletedAt: undefined, deletedBy: undefined });
  await doc.save({ validateModifiedOnly: true });
  await audit(req, `${spec.entity}.restore`, spec.entity, doc._id, `Restored ${spec.entity} ${spec.ref(doc)}`, { ref: spec.ref(doc) });
  ok(res, { restored: true });
}

/** GET /admin/trash?entity=leads: everything deleted, newest first (up to 100 of each kind). */
export async function listTrash(req: Request, res: Response) {
  const only = typeof req.query.entity === "string" ? req.query.entity : undefined;
  if (only) specFor(only);
  const groups = await Promise.all(
    Object.entries(SPECS)
      .filter(([name]) => !only || name === only)
      .map(async ([name, spec]) => {
        const rows = (await spec.model.find({ deletedAt: { $ne: null } }).sort("-deletedAt").limit(100).populate("deletedBy", "name").lean()) as Doc[];
        return rows.map((d) => ({
          entity: name,
          kind: spec.entity,
          id: String(d._id),
          ref: spec.ref(d),
          title: spec.title(d),
          deletedAt: d.deletedAt,
          deletedBy: d.deletedBy?.name,
        }));
      }),
  );
  ok(res, groups.flat().sort((a, b) => +new Date(b.deletedAt) - +new Date(a.deletedAt)));
}
