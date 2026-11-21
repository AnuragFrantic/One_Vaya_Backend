import { Router } from "express";
import * as c from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import * as limit from "../middleware/rateLimit";
import { validate } from "../middleware/validate";
import { registerSchema, loginSchema, forgotSchema, resetSchema, changePasswordSchema } from "../validators";

const r = Router();

// Each action has its own limits (see middleware/rateLimit), so e.g. sign-ups never block sign-in.
r.post("/register", limit.registerLimiter, validate(registerSchema), c.register);
r.post("/login", limit.loginIpLimiter, limit.loginEmailLimiter, validate(loginSchema), c.login);
r.post("/logout", c.logout);
r.get("/me", requireAuth, c.me);
r.post("/forgot-password", limit.forgotIpLimiter, limit.forgotEmailLimiter, validate(forgotSchema), c.forgotPassword);
r.post("/reset-password", limit.resetLimiter, validate(resetSchema), c.resetPassword);
// Any signed-in user (admin, staff or customer) changing their own password.
r.post("/change-password", requireAuth, limit.changePasswordLimiter, validate(changePasswordSchema), c.changePassword);

export default r;
