import type { Request, Response } from "express";
import { HeroSlide } from "../../models";
import { ApiError } from "../../utils/ApiError";
import { ok } from "../../utils/respond";
import { audit } from "../../services/audit.service";
import { refreshWebsite } from "../../services/website.service";
import { crud } from "./crud.factory";

/** More slides than this make the homepage slow to get through and heavy to load. */
export const MAX_SLIDES = 10;

const base = crud(HeroSlide, { searchFields: ["title", "eyebrow"], defaultSort: "order createdAt" });

/**
 * Homepage slider. List / get / update / delete are the shared content handlers (they validate sizes, write the
 * audit log and refresh the website); creating and reordering have rules of their own.
 */
export const slides = {
  ...base,

  /** A new slide goes to the end of the slider, and there is a cap on how many there can be. */
  create: async (req: Request, res: Response) => {
    if ((await HeroSlide.countDocuments()) >= MAX_SLIDES) {
      throw new ApiError(409, `The homepage slider can have up to ${MAX_SLIDES} slides. Delete one before adding another.`);
    }
    if (req.body.order === undefined) {
      const last = await HeroSlide.findOne().sort("-order").select("order").lean();
      req.body.order = (last?.order ?? -1) + 1;
    }
    return base.create(req, res);
  },

  /** POST /admin/slides/reorder { ids }: the slides in their new order, first to last. */
  reorder: async (req: Request, res: Response) => {
    const ids: string[] = req.body.ids;
    const known = new Set((await HeroSlide.find().select("_id").lean()).map((s) => String(s._id)));
    // It must be exactly today's slides: if someone else added or removed one meanwhile, ask for a refresh
    // rather than silently dropping or inventing a slide.
    if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some((id) => !known.has(id))) {
      throw new ApiError(409, "The list of slides has changed. Refresh the page and try again.");
    }
    await HeroSlide.bulkWrite(ids.map((id, order) => ({ updateOne: { filter: { _id: id }, update: { $set: { order } } } })));
    await audit(req, "hero-slide.reorder", "hero-slide", ids[0], `Changed the order of the ${ids.length} homepage slides`);
    ok(res, { ids });
    refreshWebsite("Homepage slides reordered");
  },
};
