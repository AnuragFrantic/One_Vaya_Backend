/**
 * Fills the admin "Lists" (experience categories, areas, holiday regions) from the existing data.
 * The server already does this on every start; this runs it on demand.
 *
 *   npm run fill-lookups                     (development)
 *   node dist/scripts/fill-lookups.js        (server, after npm run build)
 */
import { connectDB, disconnectDB } from "../config/db";
import { allLookups, ensureLookups } from "../services/lookup.service";

async function main() {
  await connectDB();
  await ensureLookups();
  const lists = await allLookups();
  console.log(`Experience categories (${lists.categories.length}): ${lists.categories.join(", ")}`);
  console.log(`Areas (${lists.areas.length}): ${lists.areas.map((a) => `${a.name} ${a.travelMinutes} min`).join(", ")}`);
  console.log(`Holiday regions (${lists.regions.length}): ${lists.regions.join(", ")}`);
  await disconnectDB();
}

main().catch(async (err) => {
  console.error("❌ Filling the lists failed:", err);
  await disconnectDB().catch(() => undefined);
  process.exit(1);
});
