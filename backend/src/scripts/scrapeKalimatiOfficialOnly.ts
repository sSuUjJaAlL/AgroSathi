/**
 * Official Kalimati prices ONLY — no GitHub mirror, no generated gap-fill.
 *
 * Sources:
 *   1. JSON: POST https://kalimatimarket.gov.np/api/price-history/:id
 *   2. Live bulletin: https://kalimatimarket.gov.np/price (today's 8 crops)
 *
 * Usage:
 *   npm run scrape:kalimati-official
 *   npm run scrape:kalimati-official -- --from 2018-01-01
 */
import mongoose from "mongoose";
import { connectDatabase } from "../config/database.js";
import { SELECTED_CROPS } from "../config/selectedCrops.js";
import { KalimatiPrice } from "../models/KalimatiPrice.js";
import { fetchAllOfficialKalimatiPrices } from "../scraper/kalimatiOfficialApi.js";

function parseArgs(): Date | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from" && argv[i + 1]) {
      return new Date(argv[++i] + "T12:00:00.000Z");
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const historyFrom = parseArgs();
  console.log("[Official scrape] Kalimati government site only — 8 selected commodities");
  console.log("[Official scrape] No mirror CSV, no synthetic interpolation");

  await connectDatabase();
  const rows = await fetchAllOfficialKalimatiPrices({
    historyFrom,
    includeLiveToday: true,
  });

  if (!rows.length) {
    console.error("[Official scrape] No rows returned. Check network or Kalimati rate limits.");
    process.exit(1);
  }

  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB not connected");
  const collection = db.collection("kalimati_prices");

  const del = await collection.deleteMany({ commodityEnglish: { $in: [...SELECTED_CROPS] } });
  console.log(`[Official scrape] Removed ${del.deletedCount ?? 0} previous rows for selected commodities`);

  const BATCH = 2000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await collection.insertMany(rows.slice(i, i + BATCH), { ordered: false });
  }

  const report: Array<{
    commodity: string;
    count: number;
    first: string | null;
    last: string | null;
    sources: string[];
  }> = [];

  for (const crop of SELECTED_CROPS) {
    const cropRows = rows.filter((r) => r.commodityEnglish === crop);
    const sources = [...new Set(cropRows.map((r) => r.source))];
    report.push({
      commodity: crop,
      count: cropRows.length,
      first: cropRows.length ? cropRows[0].date.toISOString().slice(0, 10) : null,
      last: cropRows.length ? cropRows[cropRows.length - 1].date.toISOString().slice(0, 10) : null,
      sources,
    });
  }

  console.log("\n[Official scrape] Per-commodity coverage:");
  console.table(report);

  const potato = rows.find(
    (r) => r.commodityEnglish === "Red potato (round)" && r.date.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
  );
  if (potato) {
    console.log("[Official scrape] Today Red potato (round):", {
      min: potato.minimumPrice,
      max: potato.maximumPrice,
      avg: potato.averagePrice,
      source: potato.source,
    });
  }

  console.log(`\n[Official scrape] Inserted ${rows.length} total documents into kalimati_prices`);
  process.exit(0);
}

main().catch((e) => {
  console.error("[Official scrape] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
