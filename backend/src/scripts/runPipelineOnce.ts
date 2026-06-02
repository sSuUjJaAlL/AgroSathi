/**
 * One-shot pipeline for REAL data (presentation-friendly):
 * Open-Meteo weather → official Kalimati live scrape → ML train (no GitHub mirror).
 * Does not start the HTTP server. Requires MongoDB + ML service (port 8000).
 *
 *   npm run pipeline:once                           # archive + weather + scrape + train (no synthetic crops)
 *   npm run pipeline:once -- --with-synthetic-history
 *   npm run pipeline:once -- --skip-archive
 *   npm run pipeline:once -- --skip-weather-sync
 *
 * Env: KALIMATI_ARCHIVE_DAYS (default 548), or KALIMATI_ARCHIVE_FROM / KALIMATI_ARCHIVE_TO (YYYY-MM-DD).
 */
import { connectDatabase } from "../config/database.js";
import { runFullDailyPipeline } from "../jobs/daily.pipeline.js";
import { runHistoricalSeed } from "./seedHistorical.js";
import { syncWeatherForCropDateRange } from "./syncWeatherOpenMeteo.js";

async function main() {
  const t0 = Date.now();
  const stage = async <T>(label: string, fn: () => Promise<T>) => {
    const s = Date.now();
    const out = await fn();
    console.log(`[Pipeline] ${label}: ${((Date.now() - s) / 1000).toFixed(2)}s`);
    return out;
  };
  const withSynthetic = process.argv.includes("--with-synthetic-history");
  const skipWeather = process.argv.includes("--skip-weather-sync");

  await stage("Mongo connect", () => connectDatabase());
  console.log("[Pipeline] MongoDB connected.");

  if (withSynthetic) {
    await stage("Synthetic seed", () => runHistoricalSeed());
  } else {
    console.log("[Pipeline] Synthetic seed skipped (default). Use --with-synthetic-history for demo-only fake history.");
  }

  console.log("[Pipeline] Kalimati prices: official site only (use npm run scrape:kalimati-official for full history).");

  if (!skipWeather) {
    const w = await stage("Weather sync", () => syncWeatherForCropDateRange());
    console.log("[Pipeline] Weather (Open-Meteo):", w);
  } else {
    console.log("[Pipeline] Skipping weather sync (--skip-weather-sync).");
  }

  await stage("Daily pipeline", () => runFullDailyPipeline());
  console.log("[Pipeline] Finished.");
  console.log(`[Pipeline] Total: ${((Date.now() - t0) / 1000).toFixed(2)}s`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
