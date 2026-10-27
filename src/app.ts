import express from "express";
import { IMAGES_ROOT } from "./services/storage.service";
import { resizedImages } from "./middleware/resizedImages";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env, corsOrigins } from "./config/env";
import api from "./routes";
import { attachUser } from "./middleware/auth";
import { apiLimiter } from "./middleware/rateLimit";
import { notFound, errorHandler } from "./middleware/error";

/** Builds the Express app (no network / DB here, so it's easy to test). */
export function createApp() {
  const app = express();

  app.set("trust proxy", 1); // correct client IPs behind a load balancer / Nginx
  app.disable("x-powered-by");

  // Public website images uploaded from the admin panel. Served before the global helmet() so the
  // website (another origin) may display them. Travel documents are never served from here.
  app.use(
    "/uploads/images",
    helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
    resizedImages,
    express.static(IMAGES_ROOT, { index: false, dotfiles: "deny", maxAge: "30d", immutable: true }),
    (_req: express.Request, res: express.Response) => res.status(404).json({ success: false, message: "Image not found" }),
  );

  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());
  if (env.NODE_ENV !== "test") app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.get("/", (_req, res) => res.json({ name: "OneVaya API", docs: "/api/health" }));
  app.use("/api", apiLimiter, attachUser, api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
