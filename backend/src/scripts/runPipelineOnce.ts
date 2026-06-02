/**
 * One-shot pipeline for REAL data (presentation-friendly):
 * optional synthetic seed → Kalimati CSV archive (historical) → Open-Meteo weather → live Kalimati scrape → ML train.
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
import { importKalimatiGithubArchiveMissingRange } from "./importKalimatiGithubArchive.js";
import { runHistoricalSeed } from "./seedHistorical.js";
import { syncWeatherForCropDateRange } from "./syncWeatherOpenMeteo.js";

function archiveRangeFromEnv(): { from: Date; to: Date } {
  const fromEnv = process.env.KALIMATI_ARCHIVE_FROM?.trim();
  const toEnv = process.env.KALIMATI_ARCHIVE_TO?.trim();
  const to = new Date();
  to.setUTCHours(12, 0, 0, 0);

  if (fromEnv && toEnv) {
    return {
      from: new Date(fromEnv + "T12:00:00.000Z"),
      to: new Date(toEnv + "T12:00:00.000Z"),
    };
  }

  const days = Math.max(1, Number(process.env.KALIMATI_ARCHIVE_DAYS ?? "548") || 548);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - days);
  return { from, to };
}

async function main() {
  const t0 = Date.now();
  const stage = async <T>(label: string, fn: () => Promise<T>) => {
    const s = Date.now();
    const out = await fn();
    console.log(`[Pipeline] ${label}: ${((Date.now() - s) / 1000).toFixed(2)}s`);
    return out;
  };
  const withSynthetic = process.argv.includes("--with-synthetic-history");
  const skipArchive = process.argv.includes("--skip-archive");
  const skipWeather = process.argv.includes("--skip-weather-sync");

  await stage("Mongo connect", () => connectDatabase());
  console.log("[Pipeline] MongoDB connected.");

  if (withSynthetic) {
    await stage("Synthetic seed", () => runHistoricalSeed());
  } else {
    console.log("[Pipeline] Synthetic seed skipped (default). Use --with-synthetic-history for demo-only fake history.");
  }

  if (!skipArchive) {
    const { from, to } = archiveRangeFromEnv();
    console.log(
      "[Pipeline] Kalimati CSV archive (ErKiran mirror):",
      from.toISOString().slice(0, 10),
      "→",
      to.toISOString().slice(0, 10)
    );
    const ar = await stage("Archive import", () => importKalimatiGithubArchiveMissingRange(from, to));
    if (ar.skipped) {
      console.log("[Pipeline] Crop data already up to date. Skipping archive import.");
    } else {
      console.log("[Pipeline] Archive import:", ar.days, "days with CSV,", ar.rows, "row upserts.");
    }
  } else {
    console.log("[Pipeline] Skipping Kalimati archive (--skip-archive). Ensure crop_prices already has history.");
  }

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
