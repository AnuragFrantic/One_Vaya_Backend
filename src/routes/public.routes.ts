import { Router } from "express";
import * as pub from "../controllers/public.controller";
import * as enq from "../controllers/enquiry.controller";
import { formLimiter } from "../middleware/rateLimit";
import { honeypot } from "../middleware/spam";
import { validate } from "../middleware/validate";
import { enquirySchema, tripRequestSchema, newsletterSchema, validatePlanSchema } from "../validators";

/** Public website routes — no sign-in needed. */
const r = Router();

r.get("/health", pub.health);

// Catalogue & content
r.get("/lookups", pub.lookups);
r.get("/services", pub.listServices);
r.get("/services/:slug", pub.getService);
r.get("/experiences", pub.listExperiences);
r.get("/experiences/:slug", pub.getExperience);
r.get("/packages", pub.listPackages);
r.get("/packages/:slug", pub.getPackage);
r.get("/hotels", pub.listHotels);
r.get("/blog", pub.listPosts);
r.get("/blog/:slug", pub.getPost);
r.get("/faqs", pub.listFaqs);
r.get("/legal/:slug", pub.getLegal);

// Forms → leads in the admin panel
r.post("/enquiries", formLimiter, honeypot, validate(enquirySchema), enq.createEnquiry);
r.post("/trip-requests", formLimiter, honeypot, validate(tripRequestSchema), enq.createTripRequest);
r.post("/itinerary/validate", validate(validatePlanSchema), enq.validateItinerary);
r.post("/newsletter", formLimiter, honeypot, validate(newsletterSchema), pub.subscribe);

export default r;
