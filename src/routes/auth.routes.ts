import { Router } from "express";
import * as c from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { authLimiter } from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import { registerSchema, loginSchema, forgotSchema, resetSchema } from "../validators";

const r = Router();

r.post("/register", authLimiter, validate(registerSchema), c.register);
r.post("/login", authLimiter, validate(loginSchema), c.login);
r.post("/logout", c.logout);
r.get("/me", requireAuth, c.me);
r.post("/forgot-password", authLimiter, validate(forgotSchema), c.forgotPassword);
r.post("/reset-password", authLimiter, validate(resetSchema), c.resetPassword);

export default r;
