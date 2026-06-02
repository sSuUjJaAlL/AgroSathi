/** Shared CSV / label helpers for Kalimati price ingestion. */
import { parseCsvLine } from "./csvLine.js";

export function normCommodityKey(s: string): string {
  return s
    .replace(/\u200c/g, "")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .toLowerCase();
}

export type CsvPriceRow = {
  product: string;
  min: number;
  max: number;
  avg: number;
};

/** Parse ErKiran / Kalimati daily CSV using header names (not fixed column indices). */
export function parseKalimatiCsvByHeader(raw: string): CsvPriceRow[] {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const iProduct = header.findIndex((h) => h.includes("product") || h.includes("commodity") || h.includes("item"));
  const iMin = header.findIndex((h) => h.includes("min"));
  const iMax = header.findIndex((h) => h.includes("max"));
  const iAvg = header.findIndex((h) => h.includes("avg") || h.includes("average"));
  if (iProduct < 0 || iAvg < 0) return [];

  const out: CsvPriceRow[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    if (cols.length <= Math.max(iProduct, iAvg)) continue;
    const product = cols[iProduct]?.trim();
    const avg = Number.parseFloat(cols[iAvg] ?? "");
    if (!product || !Number.isFinite(avg)) continue;
    const min =
      iMin >= 0 ? Number.parseFloat(cols[iMin] ?? "") : avg;
    const max =
      iMax >= 0 ? Number.parseFloat(cols[iMax] ?? "") : avg;
    if (!Number.isFinite(min) || !Number.isFinite(max)) continue;
    out.push({
      product,
      min: Math.min(min, max),
      max: Math.max(min, max),
      avg,
    });
  }
  return out;
}
