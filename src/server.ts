import { env, features } from "./config/env";
import { connectDB, disconnectDB } from "./config/db";
import { createApp } from "./app";
import { logger } from "./utils/logger";

async function main() {
  await connectDB();
  if (env.USE_MEMORY_DB) {
    // A fresh in-memory DB is empty: load the demo content automatically.
    const { seedAll } = await import("./seed/seed");
    await seedAll();
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info(`OneVaya API running on http://localhost:${env.PORT}/api`);
    logger.info(
      `Mode → AI: ${features.ai ? `LIVE (${env.AI_CHAT_MODEL} / ${env.AI_PLANNER_MODEL})` : "DEMO (no ANTHROPIC_API_KEY)"} · ` +
        `Email: ${features.email ? "SMTP" : "console"} · Storage: ${features.s3 ? "S3" : "local"}`,
    );
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down…`);
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
