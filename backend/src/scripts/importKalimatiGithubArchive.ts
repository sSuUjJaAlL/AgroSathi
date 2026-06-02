/**
 * Imports REAL daily Kalimati-style vegetable prices from the community CSV archive:
 * https://github.com/ErKiran/kalimati (MIT-licensed dumps aligned with Kalimati Market bulletin).
 *
 * This is NOT an official Government API — attribute the dataset in your report.
 * Official live snapshot still comes from scraping https://kalimatimarket.gov.np/price .
 *
 * Usage:
 *   npm run import:kalimati-archive -- --days 548
 *   npm run import:kalimati-archive -- --from 2024-01-01 --to 2025-12-31
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import axios from "axios";
import { connectDatabase } from "../config/database.js";
import { CropPrice as CropPriceDomain } from "../domain/CropPrice.js";
import { KalimatiPrice } from "../models/KalimatiPrice.js";
import { canonicalSelectedCropName } from "../config/selectedCrops.js";
import { parseKalimatiCsvByHeader } from "../scraper/kalimatiParseUtils.js";

const cropDomain = new CropPriceDomain();

const RAW_BASE =
  "https://raw.githubusercontent.com/ErKiran/kalimati/master/data/csv";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function parseArgs(): { from: Date; to: Date } {
  const argv = process.argv.slice(2);
  let fromStr: string | null = null;
  let toStr: string | null = null;
  let days = 548;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from" && argv[i + 1]) fromStr = argv[++i];
    if (argv[i] === "--to" && argv[i + 1]) toStr = argv[++i];
    if (argv[i] === "--days" && argv[i + 1]) days = Math.max(1, Number(argv[++i]) || 548);
  }

  const to = toStr ? new Date(toStr + "T12:00:00.000Z") : new Date();
  to.setUTCHours(12, 0, 0, 0);

  let from: Date;
  if (fromStr) {
    from = new Date(fromStr + "T12:00:00.000Z");
  } else {
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - days);
  }

  return { from, to };
}

async function fetchDayCsv(iso: string): Promise<string | null> {
  const [y, m, d] = iso.split("-").map(Number);
  const url = `${RAW_BASE}/${y}/${pad(m)}/${pad(d)}.csv`;
  try {
    const { data, status } = await axios.get<string>(url, {
      timeout: 25_000,
      validateStatus: (s) => s === 200 || s === 404,
      headers: { Accept: "text/csv,text/plain,*/*", "User-Agent": "AgriPriceEduBot/1.0" },
    });
    if (status === 404) return null;
    return data;
  } catch {
    return null;
  }
}

type CropRow = {
  date: Date;
  item_name: string;
  min_price: number;
  max_price: number;
  avg_price: number;
};

function archiveCsvToRows(raw: string, iso: string): CropRow[] {
  const parsed = parseKalimatiCsvByHeader(raw);
  const rows: CropRow[] = [];
  const date = new Date(`${iso}T12:00:00.000Z`);
  for (const p of parsed) {
    const canonical = canonicalSelectedCropName(p.product);
    if (!canonical) continue;
    rows.push({
      date,
      item_name: canonical,
      min_price: p.min,
      max_price: p.max,
      avg_price: p.avg,
    });
  }
  return rows;
}

/** Upsert one calendar day from the GitHub raw CSV (real bulletin-aligned mirror). Returns row count, or 0 if missing. */
export async function upsertKalimatiGithubArchiveDay(iso: string): Promise<number> {
  const raw = await fetchDayCsv(iso);
  if (!raw) return 0;
  const rows = archiveCsvToRows(raw, iso);
  if (!rows.length) return 0;
  return cropDomain.upsertMany(rows);
}

/**
 * When the official price page blocks bots, load the newest available daily CSV from the mirror (often lags 0–1 days).
 */
export async function upsertLatestKalimatiGithubArchive(maxDaysBack = 14): Promise<{ iso: string; rows: number } | null> {
  const anchor = new Date();
  anchor.setUTCHours(12, 0, 0, 0);
  for (let i = 0; i < maxDaysBack; i++) {
    const d = new Date(anchor);
    d.setUTCDate(d.getUTCDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const rows = await upsertKalimatiGithubArchiveDay(iso);
    if (rows > 0) return { iso, rows };
  }
  return null;
}

export async function importKalimatiGithubArchiveRange(from: Date, to: Date): Promise<{ days: number; rows: number }> {
  let totalRows = 0;
  let daysOk = 0;
  const cursor = new Date(from);
  cursor.setUTCHours(12, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(12, 0, 0, 0);

  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const raw = await fetchDayCsv(iso);
    if (raw) {
      const rows = archiveCsvToRows(raw, iso);
      if (rows.length) {
        totalRows += await cropDomain.upsertMany(rows);
        daysOk++;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    await new Promise((r) => setTimeout(r, 35));
  }

  return { days: daysOk, rows: totalRows };
}

/**
 * Incremental import: starts from day after the latest kalimati_prices date.
 */
export async function importKalimatiGithubArchiveMissingRange(from: Date, to: Date): Promise<{ days: number; rows: number; skipped: boolean }> {
  const latest = await KalimatiPrice.findOne().sort({ date: -1 }).select("date").lean();
  if (latest?.date) {
    const next = new Date(latest.date);
    next.setUTCHours(12, 0, 0, 0);
    next.setUTCDate(next.getUTCDate() + 1);
    if (next > to) {
      return { days: 0, rows: 0, skipped: true };
    }
    if (next > from) {
      from = next;
    }
  }
  const out = await importKalimatiGithubArchiveRange(from, to);
  return { ...out, skipped: false };
}

async function main() {
  const { from, to } = parseArgs();
  console.log("[Kalimati archive] Importing CSV range:", from.toISOString().slice(0, 10), "→", to.toISOString().slice(0, 10));
  await connectDatabase();
  const r = await importKalimatiGithubArchiveRange(from, to);
  console.log("[Kalimati archive] Days with files:", r.days, "| Row upserts:", r.rows);
  console.log("[Kalimati archive] Source: https://github.com/ErKiran/kalimati — cite in thesis/report.");
  process.exit(0);
}

const thisFile = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const runAsCli = entry === thisFile || entry.endsWith(`${path.sep}importKalimatiGithubArchive.ts`);

if (runAsCli) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
