import { Router } from "express";
import * as c from "../controllers/portal.controller";
import { requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { profileSchema, changePasswordSchema, threadCreateSchema, threadReplySchema } from "../validators";

/** My OneVaya — customer portal. All routes require a signed-in customer. */
const r = Router();
r.use(requireRole("customer"));

r.get("/profile", c.getProfile);
r.patch("/profile", validate(profileSchema), c.updateProfile);
r.post("/profile/password", validate(changePasswordSchema), c.changePassword);

r.get("/trips", c.listTrips);
r.get("/trips/:id", c.getTrip);

r.get("/documents", c.listDocuments);
r.get("/documents/:id/download", c.downloadDocument);

r.get("/invoices", c.listInvoices);

r.get("/threads", c.listThreads);
r.post("/threads", validate(threadCreateSchema), c.createThread);
r.post("/threads/:id/reply", validate(threadReplySchema), c.replyThread);

export default r;
