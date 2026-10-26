import type { Request, Response } from "express";
import type { Model } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import { escapeRegex, paging, slugify } from "../../utils/helpers";
import { refreshWebsite } from "../../services/website.service";

/**
 * Generic list / get / create / update / delete for simple admin-managed content
 * (services, experiences, packages, hotels, blog, FAQ, legal pages, chatbot knowledge).
 * Mongoose schemas reject unknown fields, so only defined fields can be written.
 */
export function crud(model: Model<any>, opts: { searchFields: string[]; slugFrom?: string; defaultSort?: string }) {
  return {
    list: async (req: Request, res: Response) => {
      const { page, limit, skip, sort } = paging(req.query);
      const filter: Record<string, unknown> = {};
      if (typeof req.query.q === "string" && req.query.q.trim()) {
        const rx = new RegExp(escapeRegex(req.query.q.trim()), "i");
        filter.$or = opts.searchFields.map((f) => ({ [f]: rx }));
      }
      const [rows, total] = await Promise.all([
        model.find(filter).sort(req.query.sort ? sort : opts.defaultSort ?? sort).skip(skip).limit(limit).lean(),
        model.countDocuments(filter),
      ]);
      ok(res, rows, 200, { page, limit, total });
    },

    get: async (req: Request, res: Response) => {
      const doc = await model.findById(req.params.id).lean();
      if (!doc) throw ApiError.notFound();
      ok(res, doc);
    },

    create: async (req: Request, res: Response) => {
      const body = { ...req.body };
      if (opts.slugFrom && !body.slug && body[opts.slugFrom]) body.slug = slugify(String(body[opts.slugFrom]));
      created(res, await model.create(body));
      refreshWebsite(`${model.modelName} created`);
    },

    update: async (req: Request, res: Response) => {
      const doc = await model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!doc) throw ApiError.notFound();
      ok(res, doc);
      refreshWebsite(`${model.modelName} updated`);
    },

    remove: async (req: Request, res: Response) => {
      const doc = await model.findByIdAndDelete(req.params.id);
      if (!doc) throw ApiError.notFound();
      ok(res, { deleted: true });
      refreshWebsite(`${model.modelName} deleted`);
    },
  };
}
