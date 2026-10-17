import type { Request, Response } from "express";
import { User, Booking, Lead, hashPassword } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import { escapeRegex, paging } from "../../utils/helpers";

/** GET /api/admin/users?role=customer&q=… — customers (with trip history) and staff. */
export async function listUsers(req: Request, res: Response) {
  const { page, limit, skip, sort } = paging(req.query);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.role === "string") filter.role = req.query.role;
  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const rx = new RegExp(escapeRegex(req.query.q.trim()), "i");
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }
  const [rows, total] = await Promise.all([User.find(filter).sort(sort).skip(skip).limit(limit).lean(), User.countDocuments(filter)]);
  ok(res, rows, 200, { page, limit, total });
}

export async function getUser(req: Request, res: Response) {
  const user = await User.findById(req.params.id).lean();
  if (!user) throw ApiError.notFound("User not found");
  const [bookings, leads] = await Promise.all([
    Booking.find({ customer: user._id }).select("ref title status startDate endDate").sort("-startDate").lean(),
    Lead.find({ $or: [{ customer: user._id }, { email: user.email }] }).select("ref source status createdAt").sort("-createdAt").lean(),
  ]);
  ok(res, { user, bookings, leads });
}

/** Admin only: create a staff or admin account. */
export async function createStaff(req: Request, res: Response) {
  const { password, ...rest } = req.body;
  if (await User.exists({ email: rest.email })) throw ApiError.conflict("An account with this email already exists");
  created(res, await User.create({ ...rest, passwordHash: await hashPassword(password) }));
}

/** Admin only: change role, deactivate/reactivate, edit name/phone. */
export async function updateUser(req: Request, res: Response) {
  if (req.params.id === req.user!.id && (req.body.role || req.body.isActive === false)) {
    throw ApiError.badRequest("You can't change your own role or deactivate yourself");
  }
  const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound("User not found");
  ok(res, user);
}
