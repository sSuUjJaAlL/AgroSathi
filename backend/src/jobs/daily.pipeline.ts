import cron from "node-cron";
import axios from "axios";
import { env } from "../config/env.js";
import { scrapeKalimatiPrices } from "../scraper/kalimati.scraper.js";
import { CropRepository } from "../modules/crop/crop.repository.js";
import { FuelRepository } from "../modules/fuel/fuel.repository.js";
import { upsertLatestKalimatiGithubArchive } from "../scripts/importKalimatiGithubArchive.js";
import { syncWeatherForCropDateRange } from "../scripts/syncWeatherOpenMeteo.js";
import { scrapeNocCurrentPrices, nocFallbackPrices } from "../scraper/noc.scraper.js";
import {
  checkAndGenerateNotifications,
  sendBuyerWeeklyDigest,
  sendFarmerMonthlyDigest,
} from "../modules/notifications/notification.service.js";

function todayUtcDate(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function runDailyScrapeJob(): Promise<{ saved: number; message: string }> {
  const { rows, meta } = await scrapeKalimatiPrices();
  const cropRepo = new CropRepository();
  const date = todayUtcDate();

  if (rows.length) {
    const headingNote = meta.listing_heading ? ` | Page: ${meta.listing_heading.slice(0, 120)}` : "";
    const payload = rows.map((r) => ({
      date,
      item_name: r.item_name,
      min_price: r.min_price,
      max_price: r.max_price,
      avg_price: r.avg_price,
    }));
    const saved = await cropRepo.upsertMany(payload);
    return {
      saved,
      message: `Upserted ${saved} crop price rows for ${date.toISOString().slice(0, 10)} (${rows.length} scraped from official site)${headingNote}`,
    };
  }

  const fallback = await upsertLatestKalimatiGithubArchive(14);
  if (fallback) {
    return {
      saved: fallback.rows,
      message: `Official site returned no parseable table (often bot/WAF). Upserted ${fallback.rows} rows from GitHub bulletin CSV for ${fallback.iso}. Source: github.com/ErKiran/kalimati`,
    };
  }

  return {
    saved: 0,
    message:
      "No crop rows: official scrape empty and no recent GitHub CSV found. Run: npm run import:kalimati-archive — check network.",
  };
}

export async function scrapeNocFuelPrices(): Promise<{ saved: number; message: string }> {
  const fuelRepo = new FuelRepository();
  const today = todayUtcDate();

  let rows = await scrapeNocCurrentPrices();
  if (!rows.length) {
    console.warn("[Fuel] NOC scrape returned nothing — using fallback prices");
    rows = nocFallbackPrices();
  }

  const toUpsert = rows.map((r) => ({
    date: today,
    fuel_type: r.fuel_type,
    price_npr: r.price_npr,
    source: r.source,
  }));

  const saved = await fuelRepo.upsertMany(toUpsert);
  return { saved, message: `NOC fuel prices saved: ${saved} rows for ${today.toISOString().slice(0, 10)}` };
}

export async function runMlTrainJob(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const url = `${env.mlServiceUrl.replace(/\/$/, "")}/train`;
    await axios.post(url, {}, { timeout: 600_000 });
    return { ok: true, detail: "ML training finished." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ML] train failed:", msg);
    return { ok: false, detail: msg };
  }
}

export async function runLstmTrainJob(): Promise<{ ok: boolean; detail?: string }> {
  try {
    const url = `${env.mlServiceUrl.replace(/\/$/, "")}/train-lstm`;
    await axios.post(url, {}, { timeout: 1_200_000 });
    return { ok: true, detail: "LSTM training finished." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[LSTM] train failed:", msg);
    return { ok: false, detail: msg };
  }
}

export async function runFullDailyPipeline(): Promise<void> {
  const scrape = await runDailyScrapeJob();
  console.log("[Pipeline]", scrape.message);
  try {
    const w = await syncWeatherForCropDateRange();
    console.log("[Pipeline] Weather sync:", w);
  } catch (err) {
    console.warn("[Pipeline] Weather sync failed (continuing):", err instanceof Error ? err.message : err);
  }
  const ml = await runMlTrainJob();
  console.log("[Pipeline] ML:", ml);
  try {
    const notif = await checkAndGenerateNotifications();
    console.log("[Pipeline] Notifications:", notif);
  } catch (err) {
    console.warn("[Pipeline] Notification check failed (continuing):", err instanceof Error ? err.message : err);
  }
}

export async function runWeeklyFullRetrain(): Promise<void> {
  console.log("[Cron] Weekly retrain — RF + MA + LSTM");
  const rf = await runMlTrainJob();
  console.log("[Cron] RF retrain:", rf);
  const lstm = await runLstmTrainJob();
  console.log("[Cron] LSTM retrain:", lstm);
}

export function registerCronJobs(): void {
  // 5 6 * * * — Kalimati scrape
  cron.schedule(env.cronDailyPipeline, () => {
    void runFullDailyPipeline().catch((err) => console.error("[Cron pipeline]", err));
  });
  console.log(`[Cron] Daily pipeline scheduled: ${env.cronDailyPipeline} (scrape → train)`);

  // 0 7 * * * — NOC fuel prices
  cron.schedule("0 7 * * *", () => {
    void scrapeNocFuelPrices().catch((err) => console.error("[Cron fuel]", err));
  });
  console.log("[Cron] NOC fuel price scrape scheduled: 07:00 daily");

  // 0 2 * * 0 — Full weekly retrain (RF + LSTM) on Sundays
  cron.schedule("0 2 * * 0", () => {
    void runWeeklyFullRetrain().catch((err) => console.error("[Cron weekly retrain]", err));
  });
  console.log("[Cron] Weekly full retrain scheduled: Sunday 02:00");

  // 0 9 * * 1 — Weekly buyer digest
  cron.schedule("0 9 * * 1", () => {
    void sendBuyerWeeklyDigest().catch((err) => console.error("[Cron buyer digest]", err));
  });
  console.log("[Cron] Buyer weekly digest scheduled: every Monday 09:00");

  // 0 9 1 * * — Monthly farmer digest
  cron.schedule("0 9 1 * *", () => {
    void sendFarmerMonthlyDigest().catch((err) => console.error("[Cron farmer digest]", err));
  });
  console.log("[Cron] Farmer monthly digest scheduled: 1st of month 09:00");
}
