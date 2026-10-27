import fs from "fs";
import http from "http";
import https from "https";
import { env, features } from "./config/env";
import { connectDB, disconnectDB } from "./config/db";
import { createApp } from "./app";
import { logger } from "./utils/logger";
import { initSocket } from "./socket";
import { ensureLookups } from "./services/lookup.service";

/** Let's Encrypt certificate on the live server (orionaiglobal.com). */
const LIVE_SSL = {
  key: "/etc/letsencrypt/live/orionaiglobal.com/privkey.pem",
  cert: "/etc/letsencrypt/live/orionaiglobal.com/fullchain.pem",
};

/**
 * HTTPS in production: SSL_KEY_PATH / SSL_CERT_PATH from .env, or else the live server's
 * Let's Encrypt files above when they exist. Plain HTTP for localhost development
 * (or when nothing is configured, e.g. behind Nginx).
 */
function sslFiles() {
  if (env.SSL_KEY_PATH && env.SSL_CERT_PATH) return { key: env.SSL_KEY_PATH, cert: env.SSL_CERT_PATH };
  if (env.NODE_ENV === "production" && fs.existsSync(LIVE_SSL.key) && fs.existsSync(LIVE_SSL.cert)) return LIVE_SSL;
  return null;
}

function createServer(app: http.RequestListener) {
  const ssl = sslFiles();
  if (ssl) {
    const options: https.ServerOptions = {
      key: fs.readFileSync(ssl.key),
      cert: fs.readFileSync(ssl.cert),
      ...(env.SSL_CA_PATH ? { ca: fs.readFileSync(env.SSL_CA_PATH) } : {}),
    };
    return { server: https.createServer(options, app), protocol: "https" as const };
  }
  if (env.NODE_ENV === "production") logger.warn("Production without an SSL certificate: serving plain HTTP (fine only behind Nginx/HTTPS proxy).");
  return { server: http.createServer(app), protocol: "http" as const };
}

async function main() {
  await connectDB();
  if (env.USE_MEMORY_DB) {
    // A fresh in-memory DB is empty: load the demo content automatically.
    const { seedAll } = await import("./seed/seed");
    await seedAll();
  }
  // Categories / areas / regions lists: first-time values + any value existing records already use.
  await ensureLookups();

  const app = createApp();
  const { server, protocol } = createServer(app);
  const io = initSocket(server); // live chat runs on the same server (http or https)

  server.listen(env.PORT, () => {
    logger.info(`OneVaya API running on ${protocol}://localhost:${env.PORT}/api (${protocol.toUpperCase()})`);
    logger.info(
      `Mode → AI: ${features.ai ? `LIVE (${env.AI_CHAT_MODEL} / ${env.AI_PLANNER_MODEL})` : "knowledge base (no ANTHROPIC_API_KEY)"} · ` +
        `Email: ${features.email ? "SMTP" : "console"} · Storage: disk (${env.UPLOAD_DIR}/) · Live chat: Socket.io`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down…`);
    await io.close();
    server.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start:", err);
  process.exit(1);
});
