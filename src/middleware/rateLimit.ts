import rateLimit from "express-rate-limit";

const opts = { standardHeaders: "draft-8" as const, legacyHeaders: false, message: { success: false, message: "Too many requests. Please try again shortly." } };

/** General API protection. */
export const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 600, ...opts });

/** Sign-in / register / password reset. */
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, ...opts });

/** Public forms (enquiries, trip requests, newsletter). */
export const formLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 30, ...opts });

/** AI endpoints — also protects the Claude API bill. */
export const aiLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 60, ...opts });
