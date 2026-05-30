/**
 * Backfills historical crop prices:
 *   1. Loads bulk CSV from DotsandCommas/kalimati-tarkari-dataset (2013–2021)
 *   2. Then fills 2022–today from the ErKiran/kalimati per-day CSV archive
 *
 * Usage:
 *   npx tsx src/scripts/backfillPrices.ts
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { connectDatabase } from "../config/database.js";
import { loadKalimatiCSV } from "../services/historicalPrices.service.js";
import { importKalimatiGithubArchiveRange } from "./importKalimatiGithubArchive.js";

dotenv.config();

async function main() {
  console.log("[BackfillPrices] Starting full historical price backfill…");
  await connectDatabase();

  // Step 1: Bulk CSV (2013–2021)
  console.log("[BackfillPrices] Step 1: Downloading bulk Kalimati CSV (2013–2021)…");
  const bulkResult = await loadKalimatiCSV();
  console.log(`[BackfillPrices] Bulk CSV: inserted=${bulkResult.inserted}, skipped=${bulkResult.skipped}`);

  // Step 2: Per-day CSV archive from 2022-01-01 to today
  const gapStart = new Date("2022-01-01T12:00:00.000Z");
  const gapEnd = new Date();
  gapEnd.setUTCHours(12, 0, 0, 0);
  console.log(`[BackfillPrices] Step 2: Fetching daily CSVs from ${gapStart.toISOString().slice(0, 10)} → ${gapEnd.toISOString().slice(0, 10)}…`);
  const archiveResult = await importKalimatiGithubArchiveRange(gapStart, gapEnd);
  console.log(`[BackfillPrices] Archive: days=${archiveResult.days}, rows=${archiveResult.rows}`);

  console.log("[BackfillPrices] Done. Run the daily pipeline to train the ML model on the full dataset.");
  process.exit(0);
}

const thisFile = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const runAsCli = entry === thisFile || entry.endsWith(`${path.sep}backfillPrices.ts`);
if (runAsCli) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
