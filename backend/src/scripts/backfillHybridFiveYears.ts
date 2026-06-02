import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import * as cheerio from "cheerio";
import { connectDatabase } from "../config/database.js";
import { CropPrice } from "../models/CropPrice.js";
import { WeatherData } from "../models/WeatherData.js";
import { FuelPrice } from "../models/FuelPrice.js";
import { SELECTED_CROPS, canonicalSelectedCropName } from "../config/selectedCrops.js";
import { fetchHistoricalWeather } from "../services/openMeteoWeather.js";

const BULK_CSV_URL =
  "https://raw.githubusercontent.com/DotsandCommas/kalimati-tarkari-dataset/master/kalimati_tarkari_dataset.csv";
const NOC_RETAIL_URL = "https://noc.org.np/retailprice";
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const CUTOFF_2023 = new Date("2023-01-01T00:00:00.000Z");

type CropPoint = {
  date: Date;
  item_name: (typeof SELECTED_CROPS)[number];
  min_price: number;
  max_price: number;
  avg_price: number;
  source: string;
};

function toUtcNoon(d: Date): Date {
  const out = new Date(d);
  out.setUTCHours(12, 0, 0, 0);
  return out;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

function fiveYearWindow(): { from: Date; to: Date } {
  const to = toUtcNoon(new Date());
  const from = toUtcNoon(new Date(to));
  from.setUTCFullYear(from.getUTCFullYear() - 5);
  return { from, to };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && ch === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseDate(raw: string): Date | null {
  const clean = raw.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(clean)
    ? clean
    : /^\d{2}\/\d{2}\/\d{4}$/.test(clean)
    ? `${clean.slice(6)}-${clean.slice(3, 5)}-${clean.slice(0, 2)}`
    : null;
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchMirrorCropRows(from: Date, to: Date): Promise<CropPoint[]> {
  let data: string;
  try {
    const res = await axios.get<string>(BULK_CSV_URL, {
      timeout: 90_000,
      headers: { Accept: "text/csv,text/plain,*/*", "User-Agent": "AgriPriceBot/1.0" },
      validateStatus: (s) => (s >= 200 && s < 300) || s === 404,
    });
    if (res.status === 404) {
      console.warn("[Hybrid5Y] Mirror CSV not found (404); continuing with generated pre-2023 crop fill.");
      return [];
    }
    data = res.data;
  } catch (e) {
    console.warn("[Hybrid5Y] Mirror CSV unavailable; continuing with generated pre-2023 crop fill.", e instanceof Error ? e.message : e);
    return [];
  }
  const lines = data.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];

  const header = parseCsvLine(lines[0].toLowerCase());
  const dateIdx = header.findIndex((c) => c.includes("date"));
  const commIdx = header.findIndex((c) => c.includes("commodity") || c.includes("product") || c.includes("item"));
  const minIdx = header.findIndex((c) => c.includes("min"));
  const maxIdx = header.findIndex((c) => c.includes("max"));
  const avgIdx = header.findIndex((c) => c.includes("avg") || c.includes("average"));
  if (dateIdx < 0 || commIdx < 0 || avgIdx < 0) return [];

  const rows: CropPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const p = parseCsvLine(lines[i]);
    const d = parseDate(p[dateIdx] ?? "");
    if (!d || d < from || d > to || d >= CUTOFF_2023) continue;

    const canonical = canonicalSelectedCropName(p[commIdx] ?? "");
    if (!canonical) continue;

    const avg = Number.parseFloat(p[avgIdx] ?? "");
    if (!Number.isFinite(avg) || avg <= 0) continue;
    const min = Number.parseFloat(p[minIdx] ?? "");
    const max = Number.parseFloat(p[maxIdx] ?? "");
    rows.push({
      date: d,
      item_name: canonical,
      min_price: Number.isFinite(min) ? min : avg,
      max_price: Number.isFinite(max) ? max : avg,
      avg_price: avg,
      source: "kalimati_mirror_real_pre2023",
    });
  }
  return rows;
}

async function loadExistingCropKeys(from: Date, to: Date): Promise<Set<string>> {
  const rows = await CropPrice.find({
    date: { $gte: from, $lte: to },
    item_name: { $in: [...SELECTED_CROPS] },
  })
    .select("date item_name")
    .lean();
  return new Set(rows.map((r) => `${r.item_name}|${isoDay(new Date(r.date))}`));
}

type CropBaseline = {
  monthAvg: number[];
  weekdayMul: number[];
  globalAvg: number;
};

async function buildCropBaselines(): Promise<Map<(typeof SELECTED_CROPS)[number], CropBaseline>> {
  const baselines = new Map<(typeof SELECTED_CROPS)[number], CropBaseline>();

  for (const crop of SELECTED_CROPS) {
    const rows = await CropPrice.find({
      item_name: crop,
      date: { $gte: CUTOFF_2023 },
    })
      .sort({ date: 1 })
      .select("date avg_price")
      .lean();

    const monthBuckets = Array.from({ length: 12 }, () => [] as number[]);
    const weekdayBuckets = Array.from({ length: 7 }, () => [] as number[]);
    for (const r of rows) {
      const d = new Date(r.date);
      monthBuckets[d.getUTCMonth()].push(r.avg_price);
      weekdayBuckets[d.getUTCDay()].push(r.avg_price);
    }
    const all = rows.map((r) => r.avg_price).filter((v) => Number.isFinite(v) && v > 0);
    const globalAvg = all.length ? all.reduce((a, b) => a + b, 0) / all.length : 100;
    const monthAvg = monthBuckets.map((arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : globalAvg));
    const weekdayAvg = weekdayBuckets.map((arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : globalAvg));
    const weekdayMul = weekdayAvg.map((v) => (globalAvg > 0 ? v / globalAvg : 1));
    baselines.set(crop, { monthAvg, weekdayMul, globalAvg });
  }

  return baselines;
}

function deterministicTrendFactor(d: Date): number {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const yearsBack = 2023 - year;
  const yearFade = 1 - Math.min(0.18, yearsBack * 0.04);
  const monthWave = 1 + Math.sin(((month + 1) / 12) * 2 * Math.PI) * 0.02;
  return Math.max(0.75, yearFade * monthWave);
}

function generateMirroredCropPoint(
  crop: (typeof SELECTED_CROPS)[number],
  d: Date,
  baseline: CropBaseline
): CropPoint {
  const monthBase = baseline.monthAvg[d.getUTCMonth()] ?? baseline.globalAvg;
  const weekdayMul = baseline.weekdayMul[d.getUTCDay()] ?? 1;
  const trend = deterministicTrendFactor(d);
  const avg = Math.max(1, monthBase * weekdayMul * trend);
  const spread = Math.max(1, avg * 0.08);
  return {
    date: d,
    item_name: crop,
    min_price: Number((avg - spread).toFixed(2)),
    max_price: Number((avg + spread).toFixed(2)),
    avg_price: Number(avg.toFixed(2)),
    source: "kalimati_mirror_generated_pre2023",
  };
}

async function upsertCropPre2023(from: Date): Promise<{ realInserted: number; generatedInserted: number }> {
  const to = addDays(CUTOFF_2023, -1);
  if (from > to) return { realInserted: 0, generatedInserted: 0 };

  const existing = await loadExistingCropKeys(from, to);
  const mirrorRows = await fetchMirrorCropRows(from, to);
  const mirrorNew = mirrorRows.filter((r) => !existing.has(`${r.item_name}|${isoDay(r.date)}`));

  if (mirrorNew.length) {
    await CropPrice.bulkWrite(
      mirrorNew.map((r) => ({
        updateOne: {
          filter: { date: r.date, item_name: r.item_name },
          update: { $setOnInsert: r },
          upsert: true,
        },
      }))
    );
  }

  const keysAfterMirror = new Set(existing);
  mirrorNew.forEach((r) => keysAfterMirror.add(`${r.item_name}|${isoDay(r.date)}`));

  const baselines = await buildCropBaselines();
  const generated: CropPoint[] = [];
  for (const crop of SELECTED_CROPS) {
    const base = baselines.get(crop);
    if (!base) continue;
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
      const key = `${crop}|${isoDay(d)}`;
      if (keysAfterMirror.has(key)) continue;
      generated.push(generateMirroredCropPoint(crop, new Date(d), base));
    }
  }

  if (generated.length) {
    const BATCH = 500;
    for (let i = 0; i < generated.length; i += BATCH) {
      const chunk = generated.slice(i, i + BATCH);
      await CropPrice.bulkWrite(
        chunk.map((r) => ({
          updateOne: {
            filter: { date: r.date, item_name: r.item_name },
            update: { $setOnInsert: r },
            upsert: true,
          },
        }))
      );
    }
  }

  return { realInserted: mirrorNew.length, generatedInserted: generated.length };
}

async function upsertWeatherRealFiveYears(from: Date, to: Date): Promise<number> {
  const rows: Array<{ date: Date; temperature: number; humidity: number; rainfall: number }> = [];
  let cur = new Date(from);
  while (cur <= to) {
    const end = addDays(cur, 365);
    const sliceEnd = end < to ? end : to;
    const part = await fetchHistoricalWeather(isoDay(cur), isoDay(sliceEnd));
    rows.push(...part.map((r) => ({ date: r.date, temperature: r.temperature, humidity: r.humidity, rainfall: r.rainfall })));
    cur = addDays(sliceEnd, 1);
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
  return rows.length;
}

type FuelRevision = { date: Date; petrol: number | null; diesel: number | null };

function toNum(text: string): number | null {
  const n = Number.parseFloat(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function parseNocDate(raw: string): Date | null {
  const m = raw.match(/(\d{4}\.\d{2}\.\d{2})/);
  if (!m) return null;
  const [y, mm, dd] = m[1].split(".");
  return new Date(`${y}-${mm}-${dd}T12:00:00.000Z`);
}

async function fetchNocRevisions(): Promise<FuelRevision[]> {
  const out: FuelRevision[] = [];
  for (let offset = 0; offset <= 400; offset += 10) {
    const { data: html } = await axios.get<string>(`${NOC_RETAIL_URL}?max=10&offset=${offset}`, {
      timeout: 30_000,
      headers: { "User-Agent": "Mozilla/5.0" },
      validateStatus: (s) => s >= 200 && s < 500,
    });
    const $ = cheerio.load(html);
    const rows = $("table tr");
    let count = 0;
    rows.each((_i, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 4) return;
      const date = parseNocDate($(tds[0]).text());
      if (!date) return;
      out.push({
        date,
        petrol: toNum($(tds[2]).text()),
        diesel: toNum($(tds[3]).text()),
      });
      count++;
    });
    if (!count) break;
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function upsertFuelRealFiveYears(from: Date, to: Date): Promise<number> {
  const revs = await fetchNocRevisions();
  if (!revs.length) return 0;

  const startIdx = revs.findIndex((r) => r.date >= from);
  const idx = startIdx > 0 ? startIdx - 1 : 0;
  let curPetrol = revs[idx].petrol;
  let curDiesel = revs[idx].diesel;
  let ri = idx + 1;

  const daily: Array<{ date: Date; fuel_type: "petrol" | "diesel"; price_npr: number; source: string }> = [];
  for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
    while (ri < revs.length && revs[ri].date <= d) {
      if (revs[ri].petrol != null) curPetrol = revs[ri].petrol;
      if (revs[ri].diesel != null) curDiesel = revs[ri].diesel;
      ri++;
    }
    if (curPetrol != null) {
      daily.push({
        date: new Date(d),
        fuel_type: "petrol",
        price_npr: curPetrol,
        source: "noc_official_revision_forward_fill",
      });
    }
    if (curDiesel != null) {
      daily.push({
        date: new Date(d),
        fuel_type: "diesel",
        price_npr: curDiesel,
        source: "noc_official_revision_forward_fill",
      });
    }
  }

  const BATCH = 500;
  for (let i = 0; i < daily.length; i += BATCH) {
    const chunk = daily.slice(i, i + BATCH);
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
  return daily.length;
}

async function main() {
  const { from, to } = fiveYearWindow();
  await connectDatabase();

  console.log(`[Hybrid5Y] Range ${isoDay(from)} -> ${isoDay(to)}`);
  console.log("[Hybrid5Y] Step 1/3 crops: fill only pre-2023, preserve 2023+");
  const crop = await upsertCropPre2023(from);
  console.log(`[Hybrid5Y] Crop inserted real=${crop.realInserted}, generated=${crop.generatedInserted}`);

  console.log("[Hybrid5Y] Step 2/3 weather: real API only");
  const weatherRows = await upsertWeatherRealFiveYears(from, to);
  console.log(`[Hybrid5Y] Weather upsert rows=${weatherRows}`);

  console.log("[Hybrid5Y] Step 3/3 fuel: NOC official only");
  const fuelRows = await upsertFuelRealFiveYears(from, to);
  console.log(`[Hybrid5Y] Fuel upsert rows=${fuelRows}`);

  console.log("[Hybrid5Y] Done.");
}

const thisFile = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const runAsCli = entry === thisFile || entry.endsWith(`${path.sep}backfillHybridFiveYears.ts`);

if (runAsCli) {
  main().catch((e) => {
    console.error("[Hybrid5Y] FAILED:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

