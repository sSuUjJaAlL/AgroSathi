import axios from "axios";
import * as cheerio from "cheerio";
import type { FuelType } from "../models/FuelPrice.js";

export interface NocFuelRow {
  fuel_type: FuelType;
  price_npr: number;
  source: string;
}

function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function parsePrice(s: string): number | null {
  const v = parseFloat(s.replace(/[^\d.]/g, "").trim());
  if (!Number.isFinite(v) || v < 50 || v > 5000) return null;
  return v;
}

function detectFuelType(labelRaw: string): FuelType | null {
  const label = normalizeLabel(labelRaw);
  if (label.includes("petrol") || label.includes("पेट्रोल")) return "petrol";
  if (label.includes("diesel") || label.includes("डिजेल")) return "diesel";
  if (label.includes("kerosene") || label.includes("मट्टितेल")) return "kerosene";
  if (label.includes("lpg") || label.includes("gas") || label.includes("एलपिजी")) return "lpg";
  return null;
}

/**
 * Attempt to scrape current fuel prices from NOC website.
 * NOC HTML structure changes occasionally — returns empty array on parse failure.
 */
const NOC_URLS = [
  "https://www.noc.org.np/",
  "https://noc.org.np/en/fuel-price",
  "https://noc.org.np/",
];

/** Class-based NOC scraper (class diagram: fuel ingestion). */
export class NocScraper {
  private readonly urls = NOC_URLS;

  async scrapeCurrentPrices(): Promise<NocFuelRow[]> {
    for (const url of this.urls) {
      try {
        const result = await attemptScrape(url);
        if (result.length >= 2) return result;
      } catch {
        /* try next URL */
      }
    }
    return [];
  }

  fallbackPrices(): NocFuelRow[] {
    return nocFallbackPrices();
  }
}

export async function scrapeNocCurrentPrices(): Promise<NocFuelRow[]> {
  return new NocScraper().scrapeCurrentPrices();
}

async function attemptScrape(url: string): Promise<NocFuelRow[]> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 15_000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const $ = cheerio.load(html);
    const rows: NocFuelRow[] = [];

    // Strategy 1: standard table rows
    $("table tr").each((_i, el) => {
      const cells = $(el).find("td");
      if (cells.length < 2) return;
      const fuelType = detectFuelType($(cells[0]).text());
      if (!fuelType) return;
      const price = parsePrice($(cells[1]).text()) ?? parsePrice($(cells[2]).text() || "");
      if (!price) return;
      rows.push({ fuel_type: fuelType, price_npr: price, source: "NOC website" });
    });

    if (rows.length >= 2) return rows;

    // Strategy 2: scan full page text for fuel keywords adjacent to prices
    const pageText = $("body").text();
    const extract = (pattern: RegExp, min: number, max: number): number | null => {
      const m = pageText.match(pattern);
      if (!m) return null;
      const p = parseFloat(m[1]);
      return p >= min && p <= max ? p : null;
    };

    const petrol = extract(/(?:petrol|पेट्रोल)[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 100, 500);
    const diesel = extract(/(?:diesel|डिजेल)[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 80, 400);
    const kerosene = extract(/(?:kerosene|मट्टितेल)[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 80, 400);
    const lpg = extract(/(?:lpg|cooking gas|एलपिजी)[^0-9]*?(\d{3,5}(?:\.\d{1,2})?)/i, 500, 5000);

    const s2: NocFuelRow[] = [];
    if (petrol) s2.push({ fuel_type: "petrol", price_npr: petrol, source: "NOC website" });
    if (diesel) s2.push({ fuel_type: "diesel", price_npr: diesel, source: "NOC website" });
    if (kerosene) s2.push({ fuel_type: "kerosene", price_npr: kerosene, source: "NOC website" });
    if (lpg) s2.push({ fuel_type: "lpg", price_npr: lpg, source: "NOC website" });

    return s2;
  } catch (err) {
    console.warn("[NOC scraper] Failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

/** Fallback: NOC prices for Kathmandu/Pokhara/Dipayal depot as of May 2026. */
export function nocFallbackPrices(): NocFuelRow[] {
  return [
    { fuel_type: "petrol", price_npr: 217, source: "NOC (Kathmandu, May 2026)" },
    { fuel_type: "diesel", price_npr: 225, source: "NOC (Kathmandu, May 2026)" },
    { fuel_type: "kerosene", price_npr: 225, source: "NOC (Kathmandu, May 2026)" },
    { fuel_type: "lpg", price_npr: 2160, source: "NOC (Kathmandu, May 2026)" },
  ];
}
