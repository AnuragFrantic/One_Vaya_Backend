import type { Request, Response } from "express";
import { Booking, TravelDocument, User } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import { keyOf, deleteFile, discardUpload, getDownloadUrl } from "../../services/storage.service";
import { emails } from "../../services/email.service";
import { documentMetaSchema } from "../../validators";
import { safeName } from "../portal.controller";

/*
 * Proposal: "Upload the original PDF documents… Choose which documents the customer can see…
 * see which documents are still pending."
 */

async function bookingOr404(id: string) {
  const b = await Booking.findById(id);
  if (!b) throw ApiError.notFound("Booking not found");
  return b;
}

/** POST /api/admin/bookings/:id/documents  (multipart: file + name + type + visibleToCustomer) */
export async function uploadDocument(req: Request, res: Response) {
  if (!req.file) throw ApiError.badRequest("Attach a file in the `file` field");
  // multer has already saved the file; remove it again if the request is rejected.
  const booking = await Booking.findById(String(req.params.id));
  if (!booking) {
    await discardUpload(req.file);
    throw ApiError.notFound("Booking not found");
  }
  const meta = documentMetaSchema.safeParse(req.body);
  if (!meta.success) {
    await discardUpload(req.file);
    throw ApiError.badRequest("Document name and type are required", meta.error.issues);
  }

  const fileKey = keyOf(req.file);
  // If a "pending" placeholder with the same name exists, fill it instead of adding a duplicate.
  const placeholder = await TravelDocument.findOne({ booking: booking._id, name: meta.data.name, status: "pending" });
  const doc = placeholder ?? new TravelDocument({ booking: booking._id, customer: booking.customer });
  doc.set({ ...meta.data, status: "ready", fileKey, mimeType: req.file.mimetype, size: req.file.size, uploadedBy: req.user!.id });
  await doc.save();

  if (doc.visibleToCustomer) {
    const customer = await User.findById(booking.customer).select("name email").lean();
    if (customer) await emails.documentReady(customer.email, customer.name, doc.name, booking.ref);
  }
  created(res, doc);
}

/** POST /api/admin/bookings/:id/documents/pending — placeholder for a document still to come. */
export async function addPendingDocument(req: Request, res: Response) {
  const booking = await bookingOr404(String(req.params.id));
  created(res, await TravelDocument.create({ ...req.body, booking: booking._id, customer: booking.customer, status: "pending", uploadedBy: req.user!.id }));
}

export async function updateDocument(req: Request, res: Response) {
  const doc = await TravelDocument.findByIdAndUpdate(req.params.docId, req.body, { new: true, runValidators: true });
  if (!doc) throw ApiError.notFound("Document not found");
  ok(res, doc);
}

export async function deleteDocument(req: Request, res: Response) {
  const doc = await TravelDocument.findById(req.params.docId);
  if (!doc) throw ApiError.notFound("Document not found");
  if (doc.fileKey) await deleteFile(doc.fileKey);
  await doc.deleteOne();
  ok(res, { deleted: true });
}

/** Staff download link (any document, including hidden ones). */
export async function documentLink(req: Request, res: Response) {
  const doc = await TravelDocument.findById(req.params.docId);
  if (!doc?.fileKey) throw ApiError.notFound("No file uploaded yet");
  ok(res, { url: await getDownloadUrl(doc.fileKey, safeName(doc.name, doc.mimeType)) });
}

/** GET /api/admin/documents/pending — every booking still waiting for documents. */
export async function pendingDocuments(_req: Request, res: Response) {
  ok(res, await TravelDocument.find({ status: "pending" }).populate("booking", "ref title startDate").populate("customer", "name").sort("createdAt").lean());
}
