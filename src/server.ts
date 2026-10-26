import fs from "fs";
import http from "http";
import https from "https";
import { env, features } from "./config/env";
import { connectDB, disconnectDB } from "./config/db";
import { createApp } from "./app";
import { logger } from "./utils/logger";
import { initSocket } from "./socket";

/**
 * HTTPS when SSL_KEY_PATH and SSL_CERT_PATH are set (production, e.g. Let's Encrypt files),
 * plain HTTP otherwise (localhost development, or when Nginx in front handles HTTPS).
 */
function createServer(app: http.RequestListener) {
  if (env.SSL_KEY_PATH && env.SSL_CERT_PATH) {
    const options: https.ServerOptions = {
      key: fs.readFileSync(env.SSL_KEY_PATH),
      cert: fs.readFileSync(env.SSL_CERT_PATH),
      ...(env.SSL_CA_PATH ? { ca: fs.readFileSync(env.SSL_CA_PATH) } : {}),
    };
    return { server: https.createServer(options, app), protocol: "https" as const };
  }
  return { server: http.createServer(app), protocol: "http" as const };
}

async function main() {
  await connectDB();
  if (env.USE_MEMORY_DB) {
    // A fresh in-memory DB is empty: load the demo content automatically.
    const { seedAll } = await import("./seed/seed");
    await seedAll();
  }

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
