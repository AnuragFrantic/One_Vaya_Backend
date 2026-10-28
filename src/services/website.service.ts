import { env } from "../config/env";
import { logger } from "../utils/logger";
import { emitAll } from "../socket/realtime";

/**
 * Tells the public website (Frontend/app/api/revalidate) that content changed, so it rebuilds its
 * pages on the next visit instead of waiting up to 60 seconds. Once that's done, every open website
 * page is told (Socket.io "content:changed") and reloads its data without a page refresh.
 * Fire-and-forget: a website that is down or not configured never blocks or fails the admin's save.
 */
export function refreshWebsite(reason: string) {
  if (!env.REVALIDATE_SECRET) return;
  const url = `${env.CLIENT_URL.replace(/\/$/, "")}/api/revalidate/`;
  fetch(url, { method: "POST", headers: { "x-revalidate-secret": env.REVALIDATE_SECRET }, signal: AbortSignal.timeout(10_000) })
    .then((res) => {
      if (res.ok) emitAll("content:changed", { reason });
      else logger.warn(`Website refresh after ${reason} failed: ${res.status} from ${url}`);
    })
    .catch((err: Error) => logger.warn(`Website refresh after ${reason} failed: ${err.message} (${url})`));
}
