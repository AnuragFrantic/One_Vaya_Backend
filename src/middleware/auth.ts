import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { Role } from "../config/constants";
import { User } from "../models";
import { ApiError } from "../utils/ApiError";

type TokenPayload = { sub: string; role: Role };

export function signToken(userId: string, role: Role) {
  return jwt.sign({ sub: userId, role } satisfies TokenPayload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/** Session cookie (httpOnly, so JavaScript can't read it). */
export function setSessionCookie(res: Response, token: string) {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SECURE ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(env.COOKIE_NAME, { path: "/" });
}

/**
 * Reads the token from the session cookie or an `Authorization: Bearer …` header
 * and attaches `req.user`. Never fails: public routes work without a user.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = req.cookies?.[env.COOKIE_NAME] || (header?.startsWith("Bearer ") ? header.slice(7) : undefined);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;
    const user = await User.findById(payload.sub).select("name email role isActive").lean();
    if (user && user.isActive) {
      req.user = { id: String(user._id), role: user.role as Role, name: user.name, email: user.email };
    }
  } catch {
    // invalid/expired token → treated as signed out
  }
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(ApiError.unauthorized());
  next();
}

/** Allow only the given roles, e.g. `requireRole("staff", "admin")`. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

export const requireStaff = requireRole("staff", "admin");
export const requireAdmin = requireRole("admin");
