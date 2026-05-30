/**
 * Backfills historical weather data from Open-Meteo archive (no API key required).
 * Fetches Kathmandu (Kalimati area) data from 2019-01-01 to today in yearly chunks.
 *
 * Usage:
 *   npx tsx src/scripts/backfillWeather.ts
 *   npx tsx src/scripts/backfillWeather.ts --from 2021-01-01 --to 2023-12-31
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { connectDatabase } from "../config/database.js";
import { syncWeatherForCropDateRange } from "./syncWeatherOpenMeteo.js";
import { fetchHistoricalWeather } from "../services/openMeteoWeather.js";
import { WeatherData } from "../models/WeatherData.js";

dotenv.config();

function parseArgs(): { from: string; to: string } {
  const argv = process.argv.slice(2);
  let from = "2019-01-01";
  let to = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from" && argv[i + 1]) from = argv[++i];
    if (argv[i] === "--to" && argv[i + 1]) to = argv[++i];
  }
  return { from, to };
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const { from, to } = parseArgs();
  console.log(`[BackfillWeather] Fetching ${from} → ${to} from Open-Meteo archive…`);
  await connectDatabase();

  // Fetch in 1-year chunks to avoid API timeout
  let cursor = from;
  let totalInserted = 0;
  while (cursor <= to) {
    const chunkEnd = addDays(cursor, 364);
    const sliceEnd = chunkEnd > to ? to : chunkEnd;
    console.log(`[BackfillWeather] Chunk: ${cursor} → ${sliceEnd}`);
    const rows = await fetchHistoricalWeather(cursor, sliceEnd);
    if (rows.length) {
      await WeatherData.bulkWrite(
        rows.map((r) => ({
          updateOne: {
            filter: { date: r.date },
            update: { $set: { date: r.date, temperature: r.temperature, rainfall: r.rainfall, humidity: r.humidity } },
            upsert: true,
          },
        }))
      );
      totalInserted += rows.length;
      console.log(`[BackfillWeather] Upserted ${rows.length} rows (total so far: ${totalInserted})`);
    }
    cursor = addDays(sliceEnd, 1);
  }

  console.log(`[BackfillWeather] Done. Total rows upserted: ${totalInserted}`);
  process.exit(0);
}

const thisFile = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const runAsCli = entry === thisFile || entry.endsWith(`${path.sep}backfillWeather.ts`);
if (runAsCli) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
