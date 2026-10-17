import type { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { MulterError } from "multer";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export function notFound(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/** Single place that turns any thrown error into a consistent JSON response. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  let status = 500;
  let message = "Something went wrong. Please try again.";
  let details: unknown;

  if (err instanceof ApiError) {
    status = err.status;
    message = err.message;
    details = err.details;
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = "Invalid data";
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid ${err.path}`;
  } else if (typeof err === "object" && err && "code" in err && (err as { code: number }).code === 11000) {
    status = 409;
    message = "This record already exists";
    details = (err as { keyValue?: unknown }).keyValue;
  } else if (err instanceof MulterError) {
    status = 400;
    message = err.code === "LIMIT_FILE_SIZE" ? `File is larger than ${env.MAX_UPLOAD_MB} MB` : err.message;
  }

  if (status >= 500) logger.error(err);

  res.status(status).json({
    success: false,
    message,
    ...(details ? { details } : {}),
    ...(env.NODE_ENV === "development" && status >= 500 && err instanceof Error ? { stack: err.stack } : {}),
  });
}
