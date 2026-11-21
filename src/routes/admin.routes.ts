import { Router } from "express";
import { requireStaff, requireAdmin } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { uploadDocument, uploadImage } from "../middleware/upload";
import * as v from "../validators";
import { dashboard } from "../controllers/admin/dashboard.controller";
import * as leads from "../controllers/admin/lead.controller";
import * as quotes from "../controllers/admin/quote.controller";
import * as bookings from "../controllers/admin/booking.controller";
import * as docs from "../controllers/admin/document.controller";
import * as fin from "../controllers/admin/finance.controller";
import * as threads from "../controllers/admin/thread.controller";
import * as reports from "../controllers/admin/report.controller";
import * as users from "../controllers/admin/user.controller";
import * as catalog from "../controllers/admin/catalog.controller";
import * as uploads from "../controllers/admin/upload.controller";
import * as lookups from "../controllers/admin/lookup.controller";
import * as auditLog from "../controllers/admin/audit.controller";
import * as records from "../controllers/admin/records.controller";
import { slides } from "../controllers/admin/slide.controller";

/** Admin panel API. Staff and admins only; some actions are admin-only. */
const r = Router();
r.use(requireStaff);

r.get("/dashboard", dashboard);

// ── Enquiries & leads ──
r.get("/leads", leads.listLeads);
r.get("/leads/:id", leads.getLead);
r.patch("/leads/:id", validate(v.leadUpdateSchema), leads.updateLead);
r.post("/leads/:id/notes", validate(v.noteSchema), leads.addNote);
r.post("/leads/:id/quote", leads.createQuoteFromLead);

// ── Quotations ──
r.get("/quotes", quotes.listQuotes);
r.post("/quotes", validate(v.quoteSchema), quotes.createQuote);
r.get("/quotes/:id", quotes.getQuote);
r.patch("/quotes/:id", validate(v.quoteUpdateSchema), quotes.updateQuote);
r.post("/quotes/:id/validate", quotes.validateQuote);
r.post("/quotes/:id/override", validate(v.overrideSchema), quotes.overrideRules);
r.get("/quotes/:id/pdf", quotes.quotePdf);
r.post("/quotes/:id/send", quotes.sendQuote);
r.post("/quotes/:id/convert", bookings.convertQuote);

// ── Website images (multer → uploads/images) ──
r.post("/uploads/image", uploadImage, uploads.uploadImage);

// ── Bookings & documents ──
r.get("/bookings", bookings.listBookings);
r.get("/bookings/:id", bookings.getBooking);
r.patch("/bookings/:id", validate(v.bookingUpdateSchema), bookings.updateBooking);
r.post("/bookings/:id/documents", uploadDocument, docs.uploadDocument);
r.post("/bookings/:id/documents/pending", validate(v.pendingDocumentSchema), docs.addPendingDocument);
r.patch("/documents/:docId", validate(v.documentUpdateSchema), docs.updateDocument);
r.delete("/documents/:docId", docs.deleteDocument);
r.get("/documents/:docId/link", docs.documentLink);
r.get("/documents/pending", docs.pendingDocuments);

// ── Payments & invoices (manual) ──
r.get("/invoices", fin.listInvoices);
r.post("/invoices", validate(v.invoiceSchema), fin.createInvoice);
r.patch("/invoices/:id", validate(v.invoiceUpdateSchema), fin.updateInvoice);
r.get("/payments", fin.listPayments);
r.post("/payments", validate(v.paymentSchema), fin.recordPayment);

// ── Messages, change requests & AI chats ──
r.get("/threads", threads.listThreads);
r.get("/threads/:id", threads.getThread);
r.post("/threads/:id/reply", validate(v.threadReplySchema), threads.replyThread);
r.patch("/threads/:id/status", threads.setThreadStatus);
r.get("/chats", threads.listChats);
r.get("/chats/:id", threads.getChat);
r.post("/chats/:id/archive", threads.archiveChat);
r.post("/chats/:id/restore", threads.restoreChat);
r.delete("/chats/:id", requireAdmin, threads.deleteChat); // permanent: admins only, archived chats only



// ── Delete / restore / Trash (admins only). A delete is reversible: nothing is erased. ──
r.delete("/records/:entity/:id", requireAdmin, records.removeRecord);
r.post("/records/:entity/:id/restore", requireAdmin, records.restoreRecord);
r.get("/trash", requireAdmin, records.listTrash);

// ── Audit log (admins only) ──
r.get("/audit-log", requireAdmin, auditLog.listAudit);

// ── Reports ──
r.get("/reports/sales", reports.salesReport);

// ── Customers & staff ──
r.get("/users", users.listUsers);
r.get("/users/:id", users.getUser);
r.post("/users", requireAdmin, validate(v.staffCreateSchema), users.createStaff);
r.patch("/users/:id", requireAdmin, validate(v.userUpdateSchema), users.updateUser);

// ── Catalogue & content (CRUD) ──
type Crud = ReturnType<typeof import("../controllers/admin/crud.factory").crud>;
// The lists screen (lookups) has its own controller without web addresses, so slugCheck is optional.
const mount = (path: string, ctl: Omit<Crud, "slugCheck"> & Partial<Pick<Crud, "slugCheck">>) => {
  r.get(`/${path}`, ctl.list);
  if (ctl.slugCheck) r.get(`/${path}/slug-check`, ctl.slugCheck); // before /:id, or "slug-check" would be read as an id
  r.post(`/${path}`, ctl.create);
  r.get(`/${path}/:id`, ctl.get);
  r.patch(`/${path}/:id`, ctl.update);
  r.delete(`/${path}/:id`, requireAdmin, ctl.remove);
};
mount("services", catalog.services);
mount("experiences", catalog.experiences);
mount("packages", catalog.packages);
mount("hotels", catalog.hotels);
mount("blog", catalog.blog);
mount("faqs", catalog.faqs);
mount("legal", catalog.legal);
mount("chatbot-knowledge", catalog.knowledge);

// Homepage slider. "reorder" comes before "/:id" so it isn't read as an id.
r.get("/slides", slides.list);
r.post("/slides/reorder", validate(v.slideReorderSchema), slides.reorder);
r.post("/slides", validate(v.slideSchema), slides.create);
r.get("/slides/:id", slides.get);
r.patch("/slides/:id", validate(v.slideUpdateSchema), slides.update);
r.delete("/slides/:id", requireAdmin, slides.remove);

// Lists: experience categories, areas (travel time) and package regions
mount("lookups", lookups);

export default r;
