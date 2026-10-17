import dns from "dns";
import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

let memoryServer: { stop: () => Promise<boolean> } | null = null;

/** Connects to MongoDB. With USE_MEMORY_DB=true a throw-away in-memory database is started instead. */
export async function connectDB() {
  let uri = env.MONGODB_URI;

  if (env.USE_MEMORY_DB) {
    // Dev-only dependency, loaded lazily so production never needs it.
    const { MongoMemoryServer } = await import("mongodb-memory-server");
    const server = await MongoMemoryServer.create();
    memoryServer = server;
    uri = server.getUri("onevaya");
    logger.warn("Using in-memory MongoDB — data is lost when the server stops.");
  }

  const dnsServers = env.DNS_SERVERS.split(",").map((s) => s.trim()).filter(Boolean);
  if (dnsServers.length) dns.setServers(dnsServers);

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
  logger.info(`MongoDB connected (${mongoose.connection.name})`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
