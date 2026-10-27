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
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20_000 });
  } catch (err) {
    // The usual cause with mongodb+srv:// is a DNS server this network can't reach.
    if (/querySrv|ETIMEOUT|ECONNREFUSED|ENOTFOUND/.test(String(err))) {
      logger.error(
        `Can't reach MongoDB (${(err as Error).message}). Check DNS_SERVERS in .env: ` +
          `${dnsServers.length ? dnsServers.join(", ") : "system DNS"} must be reachable from this machine ` +
          "(e.g. your office DNS on the local network, 8.8.8.8,1.1.1.1 on the server).",
      );
    }
    throw err;
  }
  logger.info(`MongoDB connected (${mongoose.connection.name})`);
}

export async function disconnectDB() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}
