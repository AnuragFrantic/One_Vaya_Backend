import type { Request, Response } from "express";
import { User, Lead, Quote, hashPassword } from "../models";
import { signToken, setSessionCookie, clearSessionCookie } from "../middleware/auth";
import { ApiError } from "../utils/ApiError";
import { ok, created } from "../utils/respond";
import { randomToken, sha256 } from "../utils/helpers";
import { emails } from "../services/email.service";
import { env } from "../config/env";

/** Proposal: "Automatic link between a customer's enquiries, quotes and bookings and their account". */
async function linkRecordsByEmail(userId: string, email: string) {
  await Promise.all([
    Lead.updateMany({ email, customer: { $exists: false } }, { customer: userId }),
    Quote.updateMany({ customerEmail: email, customer: { $exists: false } }, { customer: userId }),
  ]);
}

function startSession(res: Response, user: { _id: unknown; role: string }) {
  const token = signToken(String(user._id), user.role as "customer");
  setSessionCookie(res, token);
  return token;
}

export async function register(req: Request, res: Response) {
  const { name, email, password, phone } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict("An account with this email already exists. Please sign in.");
  const user = await User.create({ name, email, phone, passwordHash: await hashPassword(password), role: "customer" });
  await linkRecordsByEmail(String(user._id), email);
  const token = startSession(res, user);
  created(res, { user, token });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || !user.isActive || !(await (user as unknown as { checkPassword(p: string): Promise<boolean> }).checkPassword(password))) {
    throw ApiError.unauthorized("Email or password is incorrect");
  }
  user.lastLoginAt = new Date();
  await user.save();
  if (user.role === "customer") await linkRecordsByEmail(String(user._id), email);
  const token = startSession(res, user);
  ok(res, { user, token });
}

export async function logout(_req: Request, res: Response) {
  clearSessionCookie(res);
  ok(res, { signedOut: true });
}

export async function me(req: Request, res: Response) {
  const user = await User.findById(req.user!.id);
  if (!user) throw ApiError.unauthorized();
  ok(res, user);
}

/** Always answers the same way, so it can't be used to discover which emails have accounts. */
export async function forgotPassword(req: Request, res: Response) {
  const user = await User.findOne({ email: req.body.email, isActive: true });
  if (user) {
    const token = randomToken();
    user.set({ resetTokenHash: sha256(token), resetTokenExpires: new Date(Date.now() + 60 * 60 * 1000) });
    await user.save();
    await emails.passwordReset(user.email, user.name, `${env.CLIENT_URL}/reset-password?token=${token}`);
  }
  ok(res, { message: "If an account exists for that email, we've sent a reset link." });
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body;
  const user = await User.findOne({ resetTokenHash: sha256(token), resetTokenExpires: { $gt: new Date() } }).select("+resetTokenHash +resetTokenExpires");
  if (!user) throw ApiError.badRequest("This reset link is invalid or has expired");
  user.set({ passwordHash: await hashPassword(password), resetTokenHash: undefined, resetTokenExpires: undefined });
  await user.save();
  ok(res, { message: "Password updated. You can now sign in." });
}
