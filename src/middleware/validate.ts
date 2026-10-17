import type { Request, Response, NextFunction } from "express";
import type { ZodType } from "zod";
import { ApiError } from "../utils/ApiError";

/**
 * Validates `req.body` (default), `req.query` or `req.params` with a Zod schema.
 * On success the parsed (typed, trimmed, defaulted) value replaces the original body.
 */
export const validate =
  (schema: ZodType, where: "body" | "query" | "params" = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[where]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({ field: i.path.join("."), message: i.message }));
      return next(ApiError.badRequest("Please check the highlighted fields", details));
    }
    if (where === "body") req.body = result.data;
    else Object.assign(req[where] as object, result.data);
    next();
  };
