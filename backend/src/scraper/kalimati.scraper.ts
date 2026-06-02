import axios from "axios";
import * as cheerio from "cheerio";
import {
  matchSelectedCropByLabel,
  nepaliMatchScore,
  type SelectedCrop,
} from "../config/selectedCrops.js";

export interface ScrapedRow {
  item_name: SelectedCrop;
  unit: string;
  min_price: number;
  max_price: number;
  avg_price: number;
  /** Raw Nepali/English label from the price table (debug). */
  source_label: string;
}

export interface KalimatiScrapeMeta {
  listing_heading: string | null;
  fetched_at: string;
}

export interface KalimatiScrapeResult {
  rows: ScrapedRow[];
  meta: KalimatiScrapeMeta;
}

export const KALIMATI_PRICE_URL = "https://kalimatimarket.gov.np/price";

/** Devanagari digits → ASCII (Kalimati renders amounts like "रू ८०.००"). */
const DEVANAGARI_DIGIT_MAP: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

function normalizeNumerals(text: string): string {
  return text.replace(/[०-९]/g, (ch) => DEVANAGARI_DIGIT_MAP[ch] ?? ch);
}

export function parseMoney(text: string): number | null {
  let cleaned = normalizeNumerals(text)
    .replace(/\u200c/g, "")
    .replace(/Rs\.?|रूpees?|रू\.?/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

type PriceColumnIndices = {
  name: number;
  unit: number;
  min: number;
  max: number;
  avg: number;
};

function detectPriceColumns($: cheerio.CheerioAPI): PriceColumnIndices {
  const headers: string[] = [];
  $("#commodityPriceParticular")
    .find("thead tr")
    .last()
    .find("th, td")
    .each((_, el) => {
      headers.push($(el).text().replace(/\s+/g, " ").trim().toLowerCase());
    });

  const findIdx = (pred: (h: string) => boolean, fallback: number): number => {
    const i = headers.findIndex(pred);
    return i >= 0 ? i : fallback;
  };

  // Official table: कृषि उपज | ईकाइ | न्यूनतम | अधिकतम | औसत
  return {
    name: findIdx((h) => /उपज|commodity|product|कृषि/.test(h), 0),
    unit: findIdx((h) => /ईकाइ|unit/.test(h), 1),
    min: findIdx((h) => /न्यून|minimum|\bmin\b/.test(h), 2),
    max: findIdx((h) => /अधिक|maximum|\bmax\b/.test(h), 3),
    avg: findIdx((h) => /औसत|average|\bavg\b/.test(h), 4),
  };
}

function extractListingHeading($: cheerio.CheerioAPI): string | null {
  const t = $("h4.bottom-head").first().text().replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/**
 * Parses the official Kalimati daily price table (`#commodityPriceParticular`).
 * Uses thead to locate min / max / avg columns (not hard-coded offsets).
 * Maps only the 8 selected commodities; does not merge unrelated potato varieties.
 */
export function parseKalimatiHtml(html: string, fetchedAt = new Date().toISOString()): KalimatiScrapeResult {
  const $ = cheerio.load(html);
  const table = $("#commodityPriceParticular");
  const bodyRows = table.length ? table.find("tbody tr") : $("table tbody tr");
  const cols = table.length ? detectPriceColumns($) : { name: 0, unit: 1, min: 2, max: 3, avg: 4 };

  const bestByCrop = new Map<SelectedCrop, ScrapedRow>();

  bodyRows.each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length <= cols.avg) return;

    const name = $(cells[cols.name]).text().replace(/\s+/g, " ").trim();
    const unit = $(cells[cols.unit]).text().replace(/\s+/g, " ").trim();
    if (!name || /^कृषि|^ईकाइ|^commodity|^unit$/i.test(name)) return;

    const min = parseMoney($(cells[cols.min]).text());
    const max = parseMoney($(cells[cols.max]).text());
    const avg = parseMoney($(cells[cols.avg]).text());
    if (min == null || max == null || avg == null) return;

    const crop = matchSelectedCropByLabel(name);
    if (!crop) return;

    const row: ScrapedRow = {
      item_name: crop,
      unit,
      min_price: Math.min(min, max),
      max_price: Math.max(min, max),
      avg_price: avg,
      source_label: name,
    };

    const prev = bestByCrop.get(crop);
    if (!prev || nepaliMatchScore(name, crop) > nepaliMatchScore(prev.source_label, crop)) {
      bestByCrop.set(crop, row);
    }
  });

  const rows = [...bestByCrop.values()];
  return {
    rows,
    meta: {
      listing_heading: extractListingHeading($),
      fetched_at: fetchedAt,
    },
  };
}

let scrapeDebugLogged = false;

/** Log first N scraped rows once per process (before Mongo upsert). */
export function logScrapePreview(rows: ScrapedRow[], limit = 20): void {
  if (scrapeDebugLogged || !rows.length) return;
  scrapeDebugLogged = true;
  console.log("[Kalimati] Scrape preview (first rows):");
  for (const r of rows.slice(0, limit)) {
    console.log(
      JSON.stringify({
        commodity: r.item_name,
        source_label: r.source_label,
        minimumPrice: r.min_price,
        maximumPrice: r.max_price,
        averagePrice: r.avg_price,
      })
    );
  }
}

/** Class-based Kalimati scraper (class diagram: data ingestion). */
export class KalimatiScraper {
  async scrapePrices(): Promise<KalimatiScrapeResult> {
    const fetchedAt = new Date().toISOString();
    try {
      const { data } = await axios.get<string>(KALIMATI_PRICE_URL, {
        timeout: 45000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });
      const result = parseKalimatiHtml(data, fetchedAt);
      logScrapePreview(result.rows);
      return result;
    } catch (e) {
      console.error("[Kalimati] scrape error:", e instanceof Error ? e.message : e);
      return { rows: [], meta: { listing_heading: null, fetched_at: fetchedAt } };
    }
  }

  parseHtml(html: string, fetchedAt?: string): KalimatiScrapeResult {
    return parseKalimatiHtml(html, fetchedAt ?? new Date().toISOString());
  }
}

export async function scrapeKalimatiPrices(): Promise<KalimatiScrapeResult> {
  return new KalimatiScraper().scrapePrices();
}
