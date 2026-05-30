/**
 * One-time migration: copies all documents from local MongoDB to Atlas.
 *
 * Usage:
 *   LOCAL_MONGODB_URI=mongodb://localhost:27017/agri_price_nepal \
 *   MONGODB_URI=<atlas-uri> \
 *   npx tsx src/scripts/migrateToAtlas.ts
 */
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const LOCAL_URI = process.env.LOCAL_MONGODB_URI ?? "mongodb://localhost:27017/agri_price_nepal";
const ATLAS_URI = process.env.MONGODB_URI ?? "";
const BATCH_SIZE = 1000;
const COLLECTIONS = ["users", "crop_prices", "weather_data", "fuel_data", "predictions", "notifications"];

async function migrate() {
  if (!ATLAS_URI || ATLAS_URI === LOCAL_URI) {
    console.error("Set MONGODB_URI to your Atlas URI (must differ from LOCAL_MONGODB_URI).");
    process.exit(1);
  }

  console.log("[Migrate] Connecting to local:", LOCAL_URI.replace(/:\/\/[^@]+@/, "://<creds>@"));
  const localConn = await mongoose.createConnection(LOCAL_URI, { serverSelectionTimeoutMS: 10000 }).asPromise();

  console.log("[Migrate] Connecting to Atlas:", ATLAS_URI.replace(/:\/\/[^@]+@/, "://<creds>@"));
  const atlasConn = await mongoose.createConnection(ATLAS_URI, { serverSelectionTimeoutMS: 15000 }).asPromise();

  for (const colName of COLLECTIONS) {
    const localColl = localConn.collection(colName);
    const atlasColl = atlasConn.collection(colName);

    const total = await localColl.countDocuments();
    if (total === 0) {
      console.log(`[${colName}] Empty — skipped.`);
      continue;
    }

    let skip = 0;
    let migrated = 0;

    while (skip < total) {
      const docs = await localColl.find({}).skip(skip).limit(BATCH_SIZE).toArray();
      if (!docs.length) break;
      try {
        await atlasColl.insertMany(docs, { ordered: false });
      } catch (e: unknown) {
        // ignore duplicate key errors (already migrated rows)
        if ((e as { code?: number }).code !== 11000) throw e;
      }
      migrated += docs.length;
      skip += BATCH_SIZE;
      console.log(`[${colName}] Migrated ${migrated} / ${total} documents`);
    }

    console.log(`[${colName}] Done: ${migrated} documents.`);
  }

  await localConn.close();
  await atlasConn.close();
  console.log("[Migrate] Complete.");
}

migrate().catch((e) => {
  console.error("[Migrate] Fatal:", e);
  process.exit(1);
});
