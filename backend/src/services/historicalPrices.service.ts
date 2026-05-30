/**
 * Downloads the community Kalimati bulk CSV (2013–2021) and upserts into crop_prices.
 * Source: https://github.com/DotsandCommas/kalimati-tarkari-dataset (MIT licence — cite in reports)
 */
import axios from "axios";
import { CropPrice } from "../models/CropPrice.js";

const BULK_CSV_URL =
  "https://raw.githubusercontent.com/DotsandCommas/kalimati-tarkari-dataset/master/kalimati_tarkari_dataset.csv";

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') { quoted = !quoted; continue; }
    if (!quoted && ch === ",") { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

interface RawRow {
  date: Date;
  item_name: string;
  min_price: number;
  max_price: number;
  avg_price: number;
}

function parseDate(raw: string): Date | null {
  const clean = raw.trim();
  // Accept YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(clean)
    ? clean
    : /^\d{2}\/\d{2}\/\d{4}$/.test(clean)
    ? `${clean.slice(6)}-${clean.slice(3, 5)}-${clean.slice(0, 2)}`
    : null;
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00.000Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function loadKalimatiCSV(): Promise<{ inserted: number; skipped: number }> {
  console.log("[HistoricalPrices] Downloading bulk CSV from GitHub…");
  const { data } = await axios.get<string>(BULK_CSV_URL, {
    timeout: 60_000,
    headers: { Accept: "text/csv,text/plain,*/*", "User-Agent": "AgriPriceEduBot/1.0" },
  });

  const lines = data.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) throw new Error("Empty CSV response.");

  const header = lines[0].toLowerCase();
  const cols = parseCsvLine(header);

  // Find column indices flexibly
  const dateIdx = cols.findIndex((c) => c.includes("date"));
  const commIdx = cols.findIndex((c) => c.includes("commodity") || c.includes("product") || c.includes("item"));
  const minIdx = cols.findIndex((c) => c.includes("min"));
  const maxIdx = cols.findIndex((c) => c.includes("max"));
  const avgIdx = cols.findIndex((c) => c.includes("avg") || c.includes("average"));

  if (dateIdx < 0 || commIdx < 0 || avgIdx < 0) {
    throw new Error(`CSV header not recognized: ${header}`);
  }

  const rows: RawRow[] = [];
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const parts = parseCsvLine(lines[i]);
    const dateRaw = parts[dateIdx] ?? "";
    const name = parts[commIdx]?.trim() ?? "";
    const avg = Number.parseFloat(parts[avgIdx] ?? "");
    const min = minIdx >= 0 ? Number.parseFloat(parts[minIdx] ?? "") : avg;
    const max = maxIdx >= 0 ? Number.parseFloat(parts[maxIdx] ?? "") : avg;

    const date = parseDate(dateRaw);
    if (!date || !name || !Number.isFinite(avg) || avg <= 0) { skipped++; continue; }

    rows.push({ date, item_name: name, min_price: Number.isFinite(min) ? min : avg, max_price: Number.isFinite(max) ? max : avg, avg_price: avg });
  }

  console.log(`[HistoricalPrices] Parsed ${rows.length} rows (${skipped} skipped).`);

  // Outlier detection: flag avg_price > 3× rolling 30-day mean per commodity
  const byItem = new Map<string, RawRow[]>();
  for (const r of rows) {
    const arr = byItem.get(r.item_name) ?? [];
    arr.push(r);
    byItem.set(r.item_name, arr);
  }

  const outlierKeys = new Set<string>();
  for (const [, arr] of byItem) {
    arr.sort((a, b) => a.date.getTime() - b.date.getTime());
    for (let i = 0; i < arr.length; i++) {
      const window = arr.slice(Math.max(0, i - 30), i).map((r) => r.avg_price);
      if (!window.length) continue;
      const rollingMean = window.reduce((s, v) => s + v, 0) / window.length;
      if (arr[i].avg_price > 3 * rollingMean) {
        outlierKeys.add(`${arr[i].item_name}|${arr[i].date.toISOString()}`);
      }
    }
  }

  // Batch upsert in chunks of 500
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const ops = chunk.map((r) => ({
      updateOne: {
        filter: { date: r.date, item_name: r.item_name },
        update: {
          $set: {
            date: r.date,
            item_name: r.item_name,
            min_price: r.min_price,
            max_price: r.max_price,
            avg_price: r.avg_price,
            source: "kalimati_csv",
            isOutlier: outlierKeys.has(`${r.item_name}|${r.date.toISOString()}`),
          },
        },
        upsert: true,
      },
    }));
    await CropPrice.bulkWrite(ops);
    inserted += chunk.length;
    console.log(`[HistoricalPrices] Upserted ${inserted} / ${rows.length}`);
  }

  console.log(`[HistoricalPrices] Outliers flagged: ${outlierKeys.size}`);
  return { inserted, skipped };
}
