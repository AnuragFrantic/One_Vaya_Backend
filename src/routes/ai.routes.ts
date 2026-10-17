import { Router } from "express";
import * as c from "../controllers/ai.controller";
import { aiLimiter } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import { chatSchema, planSchema } from "../validators";

/** AI features. Sign-in is optional: signed-in customers get booking-aware answers. */
const r = Router();

r.get("/status", c.status);
r.post("/chat", aiLimiter, validate(chatSchema), c.chat);
r.post("/plan", aiLimiter, validate(planSchema), c.plan);

export default r;
