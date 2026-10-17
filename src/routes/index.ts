import { Router } from "express";
import publicRoutes from "./public.routes";
import authRoutes from "./auth.routes";
import aiRoutes from "./ai.routes";
import portalRoutes from "./portal.routes";
import adminRoutes from "./admin.routes";
import { serveLocalFile } from "../controllers/files.controller";

/** Everything lives under /api (mounted in app.ts). */
const api = Router();

api.use("/", publicRoutes); //        /api/services, /api/enquiries, …
api.use("/auth", authRoutes); //      /api/auth/login, …
api.use("/ai", aiRoutes); //          /api/ai/chat, /api/ai/plan
api.use("/portal", portalRoutes); //  /api/portal/trips, … (customers)
api.use("/admin", adminRoutes); //    /api/admin/leads, … (staff/admin)
api.get("/files/:token", serveLocalFile); // signed document downloads (local storage)

export default api;
