import axios from "axios";
import * as cheerio from "cheerio";

export interface ScrapedRow {
  item_name: string;
  unit: string;
  min_price: number;
  max_price: number;
  avg_price: number;
}

export interface KalimatiScrapeMeta {
  /** Raw heading from the price page (often includes BS date). */
  listing_heading: string | null;
  fetched_at: string;
}

export interface KalimatiScrapeResult {
  rows: ScrapedRow[];
  meta: KalimatiScrapeMeta;
}

const KALIMATI_PRICE_URL = "https://kalimatimarket.gov.np/price";

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

function extractListingHeading($: cheerio.CheerioAPI): string | null {
  const t = $("h4.bottom-head").first().text().replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/**
 * Parses the official Kalimati daily price table (`#commodityPriceParticular`).
 * Columns: commodity (Nepali name), unit, min, max, average — prices use Nepali or ASCII digits.
 */
export function parseKalimatiHtml(html: string, fetchedAt = new Date().toISOString()): KalimatiScrapeResult {
  const $ = cheerio.load(html);
  const rows: ScrapedRow[] = [];

  const table = $("#commodityPriceParticular");
  const bodyRows = table.length ? table.find("tbody tr") : $("table tbody tr");

  bodyRows.each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 5) return;

    const name = $(cells[0]).text().replace(/\s+/g, " ").trim();
    const unit = $(cells[1]).text().replace(/\s+/g, " ").trim();
    if (!name || /^कृषि|^ईकाइ|^commodity|^unit$/i.test(name)) return;

    const min = parseMoney($(cells[2]).text());
    const max = parseMoney($(cells[3]).text());
    const avg = parseMoney($(cells[4]).text());
    if (min == null || max == null || avg == null) return;

    rows.push({
      item_name: name,
      unit,
      min_price: min,
      max_price: max,
      avg_price: avg,
    });
  });

  return {
    rows: dedupeByName(rows),
    meta: {
      listing_heading: extractListingHeading($),
      fetched_at: fetchedAt,
    },
  };
}

function dedupeByName(rows: ScrapedRow[]): ScrapedRow[] {
  const map = new Map<string, ScrapedRow>();
  for (const r of rows) map.set(r.item_name, r);
  return [...map.values()];
}

export async function scrapeKalimatiPrices(): Promise<KalimatiScrapeResult> {
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
    return parseKalimatiHtml(data, fetchedAt);
  } catch (e) {
    console.error("[Kalimati] scrape error:", e instanceof Error ? e.message : e);
    return { rows: [], meta: { listing_heading: null, fetched_at: fetchedAt } };
  }
}
