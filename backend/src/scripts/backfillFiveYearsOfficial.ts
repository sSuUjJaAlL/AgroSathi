import path from "node:path";
import { fileURLToPath } from "node:url";
import axios, { type AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import { connectDatabase } from "../config/database.js";
import { CropPrice } from "../models/CropPrice.js";
import { FuelPrice, type FuelType } from "../models/FuelPrice.js";
import { WeatherData } from "../models/WeatherData.js";
import { SELECTED_CROPS } from "../config/selectedCrops.js";
import { fetchHistoricalWeather } from "../services/openMeteoWeather.js";

const KALIMATI_PRICE_HISTORY_URL = "https://kalimatimarket.gov.np/price-history";
const KALIMATI_PRICE_HISTORY_API = "https://kalimatimarket.gov.np/api/price-history";
const NOC_RETAIL_URL = "https://noc.org.np/retailprice";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const KALIMATI_TARGETS: Record<string, { optionLabel: string }> = {
  "Tomato Small (Local)": { optionLabel: "गोलभेडा सानो(लोकल)" },
  Ginger: { optionLabel: "अदुवा" },
  "Cabbage (Local)": { optionLabel: "बन्दा(लोकल)" },
  "Dry Chilli": { optionLabel: "खु्र्सानी सुकेको" },
  "Garlic Dry Chinese": { optionLabel: "लसुन सुकेको चाइनिज" },
  "Carrot (Local)": { optionLabel: "गाजर(लोकल)" },
  "Potato Red": { optionLabel: "आलु रातो(लाम्चो)" },
  "Onion Dry (Indian)": { optionLabel: "प्याज सुकेको (भारतीय)" },
};

type KalimatiChartResponse = {
  commodity?: string;
  prices?: {
    date?: string[];
    min?: Array<number | string | null>;
    max?: Array<number | string | null>;
    avg?: Array<number | string | null>;
  };
};

type FuelRevision = {
  date: Date;
  petrol: number | null;
  diesel: number | null;
  source: string;
};

async function withRetry<T>(label: string, fn: () => Promise<T>, maxAttempts = 20): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const retryable = status === 429 || (status != null && status >= 500);
      if (!retryable || attempt === maxAttempts) throw error;
      const waitMs = Math.min(60_000, 2_000 * attempt);
      console.log(`[Retry] ${label} got HTTP ${status}; waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error(`Retry loop exhausted for ${label}`);
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeDate(dateLike: string): Date | null {
  const raw = dateLike.trim();
  if (!raw) return null;

  const dot = raw.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (dot) return new Date(`${dot[1]}-${dot[2]}-${dot[3]}T12:00:00.000Z`);

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00.000Z`);

  const slash = raw.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (slash) return new Date(`${slash[1]}-${slash[2]}-${slash[3]}T12:00:00.000Z`);

  return null;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

function fiveYearsRange(): { from: Date; to: Date } {
  const to = new Date();
  to.setUTCHours(12, 0, 0, 0);
  const from = new Date(to);
  from.setUTCFullYear(from.getUTCFullYear() - 5);
  from.setUTCHours(12, 0, 0, 0);
  return { from, to };
}

async function fetchKalimatiCommodityMap(client: AxiosInstance): Promise<{ token: string; commodityMap: Map<string, string> }> {
  const { data: html } = await withRetry("kalimati price-history page", () => client.get<string>(KALIMATI_PRICE_HISTORY_URL));
  const $ = cheerio.load(html);

  const token = $('input[name="_token"]').attr("value")?.trim() ?? "";
  if (!token) throw new Error("Kalimati CSRF token not found on price-history page.");

  const commodityMap = new Map<string, string>();
  $("#commodity_selector option").each((_i, opt) => {
    const value = $(opt).attr("value")?.trim();
    const label = $(opt).text().trim();
    if (value && label && !label.includes("कृषि उपजको नाम")) {
      commodityMap.set(label, value);
    }
  });

  return { token, commodityMap };
}

async function fetchKalimatiSeriesChunk(
  client: AxiosInstance,
  token: string,
  commodityId: string,
  from: Date,
  to: Date
): Promise<KalimatiChartResponse> {
  const params = new URLSearchParams({
    locale: "np",
    _token: token,
    from: isoDay(from),
    to: isoDay(to),
  });
  const { data } = await withRetry(
    `kalimati commodity ${commodityId} ${isoDay(from)}..${isoDay(to)}`,
    () =>
      client.post<KalimatiChartResponse>(
        `${KALIMATI_PRICE_HISTORY_API}/${commodityId}`,
        params.toString(),
        { headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } }
      )
  );
  return data ?? {};
}

async function upsertKalimatiFiveYears(from: Date, to: Date): Promise<{ upserts: number }> {
  const client = axios.create({
    timeout: 45_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Referer: KALIMATI_PRICE_HISTORY_URL,
      Accept: "application/json,text/plain,*/*",
    },
  });

  const { token, commodityMap } = await fetchKalimatiCommodityMap(client);
  let totalUpserts = 0;

  for (const crop of SELECTED_CROPS) {
    const label = KALIMATI_TARGETS[crop].optionLabel;
    const commodityId = commodityMap.get(label);
    if (!commodityId) {
      throw new Error(`Kalimati commodity id missing for "${crop}" (${label}).`);
    }

    const upsertRows: Array<{
      date: Date;
      item_name: string;
      min_price: number;
      max_price: number;
      avg_price: number;
    }> = [];

    let cursor = new Date(from);
    while (cursor <= to) {
      const chunkEnd = addDays(cursor, 89);
      const sliceEnd = chunkEnd < to ? chunkEnd : to;
      const payload = await fetchKalimatiSeriesChunk(client, token, commodityId, cursor, sliceEnd);
      const dates = payload.prices?.date ?? [];
      const mins = payload.prices?.min ?? [];
      const maxes = payload.prices?.max ?? [];
      const avgs = payload.prices?.avg ?? [];

      for (let i = 0; i < dates.length; i++) {
        const date = normalizeDate(dates[i] ?? "");
        const avg = toNum(avgs[i]);
        if (!date || avg == null) continue;
        const min = toNum(mins[i]) ?? avg;
        const max = toNum(maxes[i]) ?? avg;
        upsertRows.push({
          date,
          item_name: crop,
          min_price: min,
          max_price: max,
          avg_price: avg,
        });
      }

      cursor = addDays(sliceEnd, 1);
      await new Promise((r) => setTimeout(r, 450));
    }

    const BATCH = 500;
    for (let i = 0; i < upsertRows.length; i += BATCH) {
      const chunk = upsertRows.slice(i, i + BATCH);
      await CropPrice.bulkWrite(
        chunk.map((r) => ({
          updateOne: {
            filter: { date: r.date, item_name: r.item_name },
            update: {
              $set: {
                date: r.date,
                item_name: r.item_name,
                min_price: r.min_price,
                max_price: r.max_price,
                avg_price: r.avg_price,
                source: "kalimatimarket.gov.np price-history",
              },
            },
            upsert: true,
          },
        }))
      );
      totalUpserts += chunk.length;
    }
  }

  return { upserts: totalUpserts };
}

async function upsertWeatherFiveYears(from: Date, to: Date): Promise<{ upserts: number }> {
  let cursor = new Date(from);
  const rows: Array<{ date: Date; temperature: number; rainfall: number; humidity: number }> = [];

  while (cursor <= to) {
    const chunkEnd = addDays(cursor, 365);
    const sliceEnd = chunkEnd < to ? chunkEnd : to;
    const part = await fetchHistoricalWeather(isoDay(cursor), isoDay(sliceEnd));
    rows.push(...part.map((r) => ({ date: r.date, temperature: r.temperature, rainfall: r.rainfall, humidity: r.humidity })));
    cursor = addDays(sliceEnd, 1);
  }

  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await WeatherData.bulkWrite(
      chunk.map((r) => ({
        updateOne: {
          filter: { date: r.date },
          update: { $set: r },
          upsert: true,
        },
      }))
    );
  }
  return { upserts: rows.length };
}

function parseNocDate(raw: string): Date | null {
  const m = raw.match(/(\d{4}\.\d{2}\.\d{2})/);
  if (!m) return null;
  const [y, mm, dd] = m[1].split(".");
  return new Date(`${y}-${mm}-${dd}T12:00:00.000Z`);
}

async function fetchNocRevisions(): Promise<FuelRevision[]> {
  const revisions: FuelRevision[] = [];
  for (let offset = 0; offset <= 400; offset += 10) {
    const { data: html } = await axios.get<string>(`${NOC_RETAIL_URL}?max=10&offset=${offset}`, {
      timeout: 30_000,
      headers: { "User-Agent": "Mozilla/5.0" },
      validateStatus: (s) => s >= 200 && s < 500,
    });
    const $ = cheerio.load(html);
    const trs = $("table tr");
    let rowsOnThisPage = 0;

    trs.each((_i, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 4) return;
      const d = parseNocDate($(tds[0]).text().trim());
      if (!d) return;
      const petrol = toNum($(tds[2]).text());
      const diesel = toNum($(tds[3]).text());
      revisions.push({
        date: d,
        petrol,
        diesel,
        source: "noc.org.np/retailprice",
      });
      rowsOnThisPage++;
    });

    if (rowsOnThisPage === 0) break;
    await new Promise((r) => setTimeout(r, 80));
  }

  revisions.sort((a, b) => a.date.getTime() - b.date.getTime());
  return revisions;
}

function buildDailyFuelFromRevisions(revisions: FuelRevision[], from: Date, to: Date): Array<{ date: Date; fuel_type: FuelType; price_npr: number; source: string }> {
  const result: Array<{ date: Date; fuel_type: FuelType; price_npr: number; source: string }> = [];
  if (!revisions.length) return result;

  const startingIdx = revisions.findIndex((r) => r.date >= from);
  const idx = startingIdx > 0 ? startingIdx - 1 : 0;

  let currentPetrol = revisions[idx].petrol;
  let currentDiesel = revisions[idx].diesel;
  let ri = idx + 1;

  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    while (ri < revisions.length && revisions[ri].date <= d) {
      if (revisions[ri].petrol != null) currentPetrol = revisions[ri].petrol;
      if (revisions[ri].diesel != null) currentDiesel = revisions[ri].diesel;
      ri++;
    }
    if (currentPetrol != null) {
      result.push({
        date: new Date(d),
        fuel_type: "petrol",
        price_npr: currentPetrol,
        source: "noc.org.np/retailprice (forward-filled by revision date)",
      });
    }
    if (currentDiesel != null) {
      result.push({
        date: new Date(d),
        fuel_type: "diesel",
        price_npr: currentDiesel,
        source: "noc.org.np/retailprice (forward-filled by revision date)",
      });
    }
  }
  return result;
}

async function upsertFuelFiveYears(from: Date, to: Date): Promise<{ upserts: number; revisions: number }> {
  const revisions = await fetchNocRevisions();
  const dailyRows = buildDailyFuelFromRevisions(revisions, from, to);
  const BATCH = 500;
  for (let i = 0; i < dailyRows.length; i += BATCH) {
    const chunk = dailyRows.slice(i, i + BATCH);
    await FuelPrice.bulkWrite(
      chunk.map((r) => ({
        updateOne: {
          filter: { date: r.date, fuel_type: r.fuel_type },
          update: { $set: { price_npr: r.price_npr, source: r.source } },
          upsert: true,
        },
      }))
    );
  }
  return { upserts: dailyRows.length, revisions: revisions.length };
}

async function reportCoverage(from: Date, to: Date): Promise<void> {
  const rows = await Promise.all(
    SELECTED_CROPS.map(async (item) => {
      const agg = await CropPrice.aggregate<{ _id: null; min: Date; max: Date; count: number }>([
        { $match: { item_name: item, date: { $gte: from, $lte: to } } },
        { $group: { _id: null, min: { $min: "$date" }, max: { $max: "$date" }, count: { $sum: 1 } } },
      ]);
      const r = agg[0];
      return { item, count: r?.count ?? 0, min: r?.min ? isoDay(r.min) : "-", max: r?.max ? isoDay(r.max) : "-" };
    })
  );

  console.log("\n[5Y Coverage] Selected crops:");
  rows.forEach((r) => console.log(`- ${r.item}: rows=${r.count}, range=${r.min}..${r.max}`));
}

async function main(): Promise<void> {
  const { from, to } = fiveYearsRange();
  console.log(`[5Y Backfill] Range: ${isoDay(from)} -> ${isoDay(to)}`);
  await connectDatabase();

  console.log("[5Y Backfill] Step 1/3: Kalimati official price-history API...");
  const crop = await upsertKalimatiFiveYears(from, to);
  console.log(`[5Y Backfill] Crop upserts: ${crop.upserts}`);

  console.log("[5Y Backfill] Step 2/3: Open-Meteo historical weather...");
  const weather = await upsertWeatherFiveYears(from, to);
  console.log(`[5Y Backfill] Weather upserts: ${weather.upserts}`);

  console.log("[5Y Backfill] Step 3/3: NOC retail price history...");
  const fuel = await upsertFuelFiveYears(from, to);
  console.log(`[5Y Backfill] Fuel upserts: ${fuel.upserts} from ${fuel.revisions} NOC revisions`);

  await reportCoverage(from, to);
  console.log("[5Y Backfill] Done.");
}

const thisFile = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const runAsCli = entry === thisFile || entry.endsWith(`${path.sep}backfillFiveYearsOfficial.ts`);
if (runAsCli) {
  main().catch((e) => {
    console.error("[5Y Backfill] FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

