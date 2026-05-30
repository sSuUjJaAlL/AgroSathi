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
import { CropPrice } from "../models/CropPrice.js";

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

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      q = !q;
      continue;
    }
    if (!q && c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
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

type CropUpsertOp = {
  updateOne: {
    filter: { date: Date; item_name: string };
    update: { $set: { date: Date; item_name: string; min_price: number; max_price: number; avg_price: number } };
    upsert: boolean;
  };
};

function archiveCsvToBulkOps(raw: string): CropUpsertOp[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0]?.toLowerCase() || "";
  if (!header.includes("product") || !header.includes("avg")) return [];

  const ops: CropUpsertOp[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    if (cols.length < 6) continue;
    const date = new Date(cols[0] + "T12:00:00.000Z");
    const item_name = cols[1];
    const max_price = Number.parseFloat(cols[3]);
    const min_price = Number.parseFloat(cols[4]);
    const avg_price = Number.parseFloat(cols[5]);
    if (!item_name || !Number.isFinite(min_price) || !Number.isFinite(max_price) || !Number.isFinite(avg_price)) {
      continue;
    }
    ops.push({
      updateOne: {
        filter: { date, item_name },
        update: { $set: { date, item_name, min_price, max_price, avg_price } },
        upsert: true,
      },
    });
  }
  return ops;
}

/** Upsert one calendar day from the GitHub raw CSV (real bulletin-aligned mirror). Returns row count, or 0 if missing. */
export async function upsertKalimatiGithubArchiveDay(iso: string): Promise<number> {
  const raw = await fetchDayCsv(iso);
  if (!raw) return 0;
  const ops = archiveCsvToBulkOps(raw);
  if (!ops.length) return 0;
  await CropPrice.bulkWrite(ops);
  return ops.length;
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
      const ops = archiveCsvToBulkOps(raw);
      if (ops.length) {
        await CropPrice.bulkWrite(ops);
        totalRows += ops.length;
        daysOk++;
      }
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    await new Promise((r) => setTimeout(r, 35));
  }

  return { days: daysOk, rows: totalRows };
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
