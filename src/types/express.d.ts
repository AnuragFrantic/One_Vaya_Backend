import type { Role } from "../config/constants";

declare global {
  namespace Express {
    interface Request {
      /** Set by `attachUser` when a valid session token is present. */
      user?: { id: string; role: Role; name: string; email: string };
    }
  }
}

export {};
