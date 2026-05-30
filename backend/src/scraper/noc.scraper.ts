import axios from "axios";
import * as cheerio from "cheerio";
import type { FuelType } from "../models/FuelPrice.js";

export interface NocFuelRow {
  fuel_type: FuelType;
  price_npr: number;
  source: string;
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

export async function scrapeNocCurrentPrices(): Promise<NocFuelRow[]> {
  for (const url of NOC_URLS) {
    try {
      const result = await attemptScrape(url);
      if (result.length >= 2) return result;
    } catch {
      /* try next URL */
    }
  }
  return [];
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
      const label = $(cells[0]).text().trim().toLowerCase();
      const priceText = $(cells[1]).text().replace(/[^\d.]/g, "").trim();
      const price = parseFloat(priceText);
      if (!price || isNaN(price) || price < 50 || price > 5000) return;

      if (label.includes("petrol")) rows.push({ fuel_type: "petrol", price_npr: price, source: "NOC website" });
      else if (label.includes("diesel")) rows.push({ fuel_type: "diesel", price_npr: price, source: "NOC website" });
      else if (label.includes("kerosene")) rows.push({ fuel_type: "kerosene", price_npr: price, source: "NOC website" });
      else if (label.includes("lpg") || label.includes("gas")) rows.push({ fuel_type: "lpg", price_npr: price, source: "NOC website" });
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

    const petrol = extract(/petrol[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 100, 500);
    const diesel = extract(/diesel[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 80, 400);
    const kerosene = extract(/kerosene[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 80, 400);
    const lpg = extract(/(?:lpg|cooking gas)[^0-9]*?(\d{3,5}(?:\.\d{1,2})?)/i, 500, 5000);

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
