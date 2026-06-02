import cron from "node-cron";
import axios from "axios";
import { env } from "../config/env.js";
import { KalimatiPrice } from "../models/KalimatiPrice.js";
import { FuelPrice } from "../models/FuelPrice.js";
import { logScrapePreview, scrapeKalimatiPrices } from "../scraper/kalimati.scraper.js";
import { CropRepository } from "../modules/crop/crop.repository.js";
import { FuelRepository } from "../modules/fuel/fuel.repository.js";
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
  const date = todayUtcDate();
  const latestCrop = await KalimatiPrice.findOne().sort({ date: -1 }).select("date").lean();
  if (latestCrop?.date && new Date(latestCrop.date) >= date) {
    return { saved: 0, message: "Crop data already up to date. Skipping scraper." };
  }

  const { rows, meta } = await scrapeKalimatiPrices();
  logScrapePreview(rows);
  const cropRepo = new CropRepository();

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

  return {
    saved: 0,
    message:
      "No crop rows from official Kalimati /price page. Check network or run: npm run scrape:kalimati-official",
  };
}

export async function scrapeNocFuelPrices(): Promise<{ saved: number; message: string }> {
  const fuelRepo = new FuelRepository();
  const today = todayUtcDate();
  const latestFuel = await FuelPrice.findOne().sort({ date: -1 }).select("date").lean();
  if (latestFuel?.date && new Date(latestFuel.date) >= today) {
    return { saved: 0, message: `Fuel data already up to date for ${today.toISOString().slice(0, 10)}. Skipping fuel sync.` };
  }

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
    await axios.post(url, { force: false }, { timeout: 600_000 });
    return { ok: true, detail: "ML training finished." };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[ML] train failed:", msg);
    return { ok: false, detail: msg };
  }
}

async function shouldTrainFromHistoricalData(): Promise<boolean> {
  const latestPrediction = await KalimatiPrice.db.collection("predictions").findOne(
    { algorithm: "random_forest" },
    { sort: { date: -1 }, projection: { date: 1 } }
  );
  if (!latestPrediction?.date) return true; // no predictions at all

  const [cropTip, weatherTip, fuelTip] = await Promise.all([
    KalimatiPrice.findOne({ generated: false }).sort({ date: -1 }).select("date").lean(),
    KalimatiPrice.db.collection("weather_data").findOne({}, { sort: { date: -1 }, projection: { date: 1 } }),
    KalimatiPrice.db.collection("fuel_prices").findOne(
      { fuel_type: "diesel" },
      { sort: { date: -1 }, projection: { date: 1 } }
    ),
  ]);

  const latestSource = [cropTip?.date, weatherTip?.date, fuelTip?.date]
    .filter(Boolean)
    .map((d) => new Date(d as Date).getTime())
    .sort((a, b) => b - a)[0];

  if (!latestSource) return true;
  return new Date(latestPrediction.date).getTime() < latestSource;
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
  const started = Date.now();
  const timed = async <T>(label: string, fn: () => Promise<T>) => {
    const t = Date.now();
    const out = await fn();
    console.log(`[Pipeline] ${label}: ${((Date.now() - t) / 1000).toFixed(2)} sec`);
    return out;
  };

  const scrape = await timed("Crop scraping", () => runDailyScrapeJob());
  console.log("[Pipeline]", scrape.message);
  const fuel = await timed("Fuel sync", () => scrapeNocFuelPrices());
  console.log("[Pipeline]", fuel.message);

  let weatherInserted = 0;
  try {
    const w = await timed("Weather sync", () => syncWeatherForCropDateRange());
    weatherInserted = w.inserted;
    console.log("[Pipeline] Weather sync:", w);
  } catch (err) {
    console.warn("[Pipeline] Weather sync failed (continuing):", err instanceof Error ? err.message : err);
  }

  const hasNewData = scrape.saved > 0 || fuel.saved > 0 || weatherInserted > 0;
  const shouldTrain = hasNewData || (await shouldTrainFromHistoricalData());
  if (!shouldTrain) {
    console.log("[Pipeline] No new source data and predictions are already up to date. Skipping model retraining.");
  } else {
    const ml = await timed("RF training", () => runMlTrainJob());
    console.log("[Pipeline] ML:", ml);
  }

  try {
    const notif = await timed("Notifications", () => checkAndGenerateNotifications());
    console.log("[Pipeline] Notifications:", notif);
  } catch (err) {
    console.warn("[Pipeline] Notification check failed (continuing):", err instanceof Error ? err.message : err);
  }
  console.log(`[Pipeline] Total Pipeline Time: ${((Date.now() - started) / 1000).toFixed(2)} sec`);
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
