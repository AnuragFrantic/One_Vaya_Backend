import type { Request, Response, NextFunction } from "express";
import rateLimit, { type Options } from "express-rate-limit";

const MIN = 60 * 1000;

/**
 * 429 reply that tells people how long to wait, e.g. "Too many sign-in attempts. Please try again in 12 minutes."
 * Also sets Retry-After (seconds) so apps can show their own countdown.
 */
const tooMany =
  (what: string) =>
  (req: Request, res: Response, _next: NextFunction, options: Options) => {
    const info = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
    const reset = info?.resetTime?.getTime();
    const seconds = Math.max(1, Math.ceil(((reset ?? Date.now() + options.windowMs) - Date.now()) / 1000));
    const minutes = Math.ceil(seconds / 60);
    res.setHeader("Retry-After", String(seconds));
    res.status(options.statusCode).json({
      success: false,
      message: `Too many ${what}. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
      retryAfter: seconds,
    });
  };

const base = { standardHeaders: "draft-8" as const, legacyHeaders: false };

/** The email typed into a form, normalised, so one account can't be attacked from many IPs. */
const emailOf = (req: Request) => (typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "");

/** General API protection. */
export const apiLimiter = rateLimit({ ...base, windowMs: 15 * MIN, limit: 600, handler: tooMany("requests") });

/*
 * Sign-in: only FAILED attempts count (a successful sign-in never locks anyone out).
 * Per IP the limit is a little higher than per email, because a whole office can share one IP.
 */
export const loginIpLimiter = rateLimit({ ...base, windowMs: 15 * MIN, limit: 10, skipSuccessfulRequests: true, handler: tooMany("sign-in attempts") });
export const loginEmailLimiter = rateLimit({
  ...base,
  windowMs: 15 * MIN,
  limit: 5,
  skipSuccessfulRequests: true,
  skip: (req) => !emailOf(req),
  keyGenerator: (req) => `login:${emailOf(req)}`,
  handler: tooMany("sign-in attempts for this account"),
});

/** New accounts. */
export const registerLimiter = rateLimit({ ...base, windowMs: 60 * MIN, limit: 10, handler: tooMany("sign-up attempts") });

/** "Forgot password" sends an email, so it's kept tight: per IP and per email address. */
export const forgotIpLimiter = rateLimit({ ...base, windowMs: 60 * MIN, limit: 5, handler: tooMany("password reset requests") });
export const forgotEmailLimiter = rateLimit({
  ...base,
  windowMs: 60 * MIN,
  limit: 3,
  skip: (req) => !emailOf(req),
  keyGenerator: (req) => `forgot:${emailOf(req)}`,
  handler: tooMany("password reset requests for this account"),
});

/** Setting a new password with the emailed link. */
export const resetLimiter = rateLimit({ ...base, windowMs: 15 * MIN, limit: 10, skipSuccessfulRequests: true, handler: tooMany("password reset attempts") });

/** Signed-in password change: failed tries per account (guessing the current password). Runs after requireAuth. */
export const changePasswordLimiter = rateLimit({
  ...base,
  windowMs: 15 * MIN,
  limit: 5,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `change:${req.user?.id ?? ""}`,
  handler: tooMany("password change attempts"),
});

/** Public forms (enquiries, trip requests, newsletter). */
export const formLimiter = rateLimit({ ...base, windowMs: 60 * MIN, limit: 30, handler: tooMany("form submissions") });

/** AI endpoints — also protects the Claude API bill. */
export const aiLimiter = rateLimit({ ...base, windowMs: 60 * MIN, limit: 60, handler: tooMany("messages") });
