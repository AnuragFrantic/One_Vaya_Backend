import type { Request, Response } from "express";
import { Service, Experience, HolidayPackage, Hotel, BlogPost, Faq, LegalPage, Subscriber } from "../models";
import { ApiError } from "../utils/ApiError";
import { ok, created } from "../utils/respond";
import { features } from "../config/env";
import { allLookups } from "../services/lookup.service";

/*
 * Public website data (no sign-in). These endpoints replace the static data in
 * Frontend/lib/data — the website's lib/api.ts functions call them.
 * Internal fields (costAED) are never returned here.
 */

const PUBLIC_EXPERIENCE = "-costAED -__v";

export async function health(_req: Request, res: Response) {
  ok(res, { status: "ok", time: new Date().toISOString(), features });
}

/** Experience categories, areas (with travel time) and package regions, managed in the admin panel. */
export async function lookups(_req: Request, res: Response) {
  ok(res, await allLookups());
}

export const listServices = async (_req: Request, res: Response) =>
  ok(res, await Service.find({ isPublished: true }).sort("order title").lean());

export async function getService(req: Request, res: Response) {
  const s = await Service.findOne({ slug: req.params.slug, isPublished: true }).lean();
  if (!s) throw ApiError.notFound("Service not found");
  ok(res, s);
}

export async function listExperiences(req: Request, res: Response) {
  const filter: Record<string, unknown> = { isPublished: true };
  if (typeof req.query.category === "string") filter.category = req.query.category;
  if (typeof req.query.area === "string") filter.area = req.query.area;
  ok(res, await Experience.find(filter).select(PUBLIC_EXPERIENCE).sort("order name").lean());
}

export async function getExperience(req: Request, res: Response) {
  const e = await Experience.findOne({ slug: req.params.slug, isPublished: true }).select(PUBLIC_EXPERIENCE).lean();
  if (!e) throw ApiError.notFound("Experience not found");
  ok(res, e);
}

export async function listPackages(req: Request, res: Response) {
  const filter: Record<string, unknown> = { isPublished: true };
  if (typeof req.query.region === "string") filter.region = req.query.region;
  ok(res, await HolidayPackage.find(filter).sort("order title").lean());
}

export async function getPackage(req: Request, res: Response) {
  const p = await HolidayPackage.findOne({ slug: req.params.slug, isPublished: true }).lean();
  if (!p) throw ApiError.notFound("Holiday not found");
  ok(res, p);
}

export const listHotels = async (_req: Request, res: Response) =>
  ok(res, await Hotel.find({ isActive: true }).select("-costAED -__v").sort("name").lean());

export const listPosts = async (_req: Request, res: Response) =>
  ok(res, await BlogPost.find({ isPublished: true }).select("-body").sort("-date").lean());

export async function getPost(req: Request, res: Response) {
  const p = await BlogPost.findOne({ slug: req.params.slug, isPublished: true }).lean();
  if (!p) throw ApiError.notFound("Article not found");
  ok(res, p);
}

export const listFaqs = async (_req: Request, res: Response) =>
  ok(res, await Faq.find({ isPublished: true }).sort("category order").lean());

export async function getLegal(req: Request, res: Response) {
  const l = await LegalPage.findOne({ slug: req.params.slug }).lean();
  if (!l) throw ApiError.notFound("Page not found");
  ok(res, l);
}

export async function subscribe(req: Request, res: Response) {
  await Subscriber.updateOne({ email: req.body.email }, { email: req.body.email }, { upsert: true });
  created(res, { subscribed: true });
}
