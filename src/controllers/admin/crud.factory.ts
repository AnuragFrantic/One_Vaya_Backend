import type { Request, Response } from "express";
import type { Model } from "mongoose";
import { ApiError } from "../../utils/ApiError";
import { ok, created } from "../../utils/respond";
import crypto from "crypto";
import { escapeRegex, paging, slugify } from "../../utils/helpers";
import { refreshWebsite } from "../../services/website.service";
import { assertContentLimits } from "../../utils/limits";
import { audit, auditEdit, snapshot } from "../../services/audit.service";

/**
 * Generic list / get / create / update / delete for simple admin-managed content
 * (services, experiences, packages, hotels, blog, FAQ, legal pages, chatbot knowledge).
 * Mongoose schemas reject unknown fields, so only defined fields can be written.
 */
export function crud(model: Model<any>, opts: { searchFields: string[]; slugFrom?: string; defaultSort?: string }) {
  const kind = model.modelName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase(); // "HolidayPackage" → "holiday-package"
  const nameOf = (d: { title?: string; name?: string; q?: string; slug?: string }) => `"${d.title ?? d.name ?? d.q ?? d.slug ?? ""}"`;

  /* ── web addresses (slugs): made from the title, always unique ── */
  const slugTaken = async (slug: string, exceptId?: string) => !!(await model.exists({ slug, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }));
  /** The slug itself if it is free, otherwise the first free "slug-2", "slug-3"… */
  const freeSlug = async (base: string, exceptId?: string) => {
    if (!(await slugTaken(base, exceptId))) return base;
    for (let n = 2; n < 100; n++) {
      const candidate = `${base.slice(0, 76)}-${n}`;
      if (!(await slugTaken(candidate, exceptId))) return candidate;
    }
    return `${base.slice(0, 70)}-${crypto.randomInt(1000, 9999)}`;
  };
  /** A title with no Latin letters (Arabic only…) still gets a valid address. */
  const fallbackSlug = () => `${kind}-${crypto.randomInt(10000, 99999)}`;
  const taken = async (slug: string, exceptId?: string) =>
    new ApiError(409, `The web address "${slug}" is already used by another ${kind.replace(/-/g, " ")}. Try "${await freeSlug(slug, exceptId)}", or leave it empty to have one made for you.`, [
      { field: "slug", message: `Already used. Try "${await freeSlug(slug, exceptId)}".` },
    ]);
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

    /**
     * GET …/slug-check?title=…&slug=…&exclude=<id>: what the web address will be, and whether it is free.
     * `slug` (a manual address) wins over `title`. `suggestion` is the nearest free one.
     */
    slugCheck: async (req: Request, res: Response) => {
      if (!opts.slugFrom) throw ApiError.notFound();
      const typed = typeof req.query.slug === "string" ? req.query.slug : "";
      const title = typeof req.query.title === "string" ? req.query.title : "";
      const exclude = typeof req.query.exclude === "string" && /^[a-f\d]{24}$/i.test(req.query.exclude) ? req.query.exclude : undefined;
      const wanted = slugify(typed || title);
      // Nothing usable yet (empty, or no Latin letters): `fallback` tells the form a generic address will be made on save.
      if (!wanted) return ok(res, { slug: "", available: false, suggestion: "", fallback: !!(typed || title).trim() });
      const available = !(await slugTaken(wanted, exclude));
      ok(res, { slug: wanted, available, suggestion: available ? wanted : await freeSlug(wanted, exclude), fallback: false });
    },

    create: async (req: Request, res: Response) => {
      assertContentLimits(req.body);
      const body = { ...req.body };
      if (opts.slugFrom) {
        const typed = typeof body.slug === "string" ? body.slug.trim() : "";
        if (typed) {
          if (await slugTaken(typed)) throw await taken(typed); // a manual address that is already used
        } else {
          // Made from the title; "-2", "-3"… is added if another page already has it.
          body.slug = await freeSlug(slugify(String(body[opts.slugFrom] ?? "")) || fallbackSlug());
        }
      }
      let doc;
      try {
        doc = await model.create(body);
      } catch (err) {
        // Two people saving the same title at once: the database's unique index catches the second.
        if (typeof err === "object" && err && (err as { code?: number }).code === 11000 && body.slug) throw await taken(String(body.slug));
        throw err;
      }
      await audit(req, `${kind}.create`, kind, doc._id, `Created ${kind} ${nameOf(doc)}`);
      created(res, doc);
      refreshWebsite(`${model.modelName} created`);
    },

    update: async (req: Request, res: Response) => {
      assertContentLimits(req.body);
      const existing = await model.findById(req.params.id);
      if (!existing) throw ApiError.notFound();
      if (opts.slugFrom && typeof req.body.slug === "string" && req.body.slug !== existing.slug && (await slugTaken(req.body.slug, String(existing._id)))) {
        throw await taken(req.body.slug, String(existing._id));
      }
      const before = snapshot(existing);
      const doc = await model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!doc) throw ApiError.notFound();
      await auditEdit(req, kind, doc._id, nameOf(doc), before, snapshot(doc));
      ok(res, doc);
      refreshWebsite(`${model.modelName} updated`);
    },

    remove: async (req: Request, res: Response) => {
      const doc = await model.findByIdAndDelete(req.params.id);
      if (!doc) throw ApiError.notFound();
      // Website content is deleted for good (it is only text), so the log keeps what it was called.
      await audit(req, `${kind}.delete`, kind, doc._id, `Deleted ${kind} ${nameOf(doc)}`);
      ok(res, { deleted: true });
      refreshWebsite(`${model.modelName} deleted`);
    },
  };
}
