/**
 * Debug Kalimati table structure — run: npx tsx src/scripts/debugKalimatiTable.ts
 */
import axios from "axios";
import * as cheerio from "cheerio";
import { parseKalimatiHtml } from "../scraper/kalimati.scraper.js";

const KALIMATI_PRICE_URL = "https://kalimatimarket.gov.np/price";
const TARGET_PATTERNS = [/रातो\s*आलु/i, /potato\s*red/i, /red\s*potato/i, /गोलो/i];

async function main() {
  const { data: html } = await axios.get<string>(KALIMATI_PRICE_URL, {
    timeout: 45000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  console.log("URL:", KALIMATI_PRICE_URL);
  const $ = cheerio.load(html);

  const tables = $("table").toArray();
  console.log("\nTables on page:", tables.length);

  const targetTable = $("#commodityPriceParticular");
  console.log("#commodityPriceParticular found:", targetTable.length > 0);

  const table = targetTable.length ? targetTable : $("table").first();
  const headers = table.find("thead tr").last().find("th, td");
  console.log("\nHeader cells (count=" + headers.length + "):");
  headers.each((i, el) => {
    console.log(`  th[${i}]:`, $(el).text().replace(/\s+/g, " ").trim());
  });

  if (!headers.length) {
    const firstRow = table.find("tr").first().find("th, td");
    console.log("\nFirst row as header fallback (count=" + firstRow.length + "):");
    firstRow.each((i, el) => {
      console.log(`  [${i}]:`, $(el).text().replace(/\s+/g, " ").trim());
    });
  }

  console.log("\n--- Matching rows (raw HTML) ---");
  table.find("tbody tr").each((_, tr) => {
    const rowText = $(tr).text().replace(/\s+/g, " ");
    if (!TARGET_PATTERNS.some((p) => p.test(rowText))) return;

    console.log("\nROW HTML:\n", $.html(tr));
    const cells = $(tr).find("td");
    console.log("TD count:", cells.length);
    cells.each((i, td) => {
      console.log(`  cells[${i}] text:`, JSON.stringify($(td).text().replace(/\s+/g, " ").trim()));
      console.log(`  cells[${i}] html:`, $.html(td).slice(0, 200));
    });
  });

  console.log("\n--- All आलु (potato) rows on page ---");
  table.find("tbody tr").each((_, tr) => {
    const rowText = $(tr).text();
    if (!/आलु/i.test(rowText)) return;
    const cells = $(tr).find("td");
    const vals: string[] = [];
    cells.each((_, td) => {
      vals.push($(td).text().replace(/\s+/g, " ").trim());
    });
    console.log(vals.join(" | "));
  });

  const parsed = parseKalimatiHtml(html);
  const potato = parsed.rows.filter((r) => /potato/i.test(r.item_name));
  console.log("\n--- Parsed rows matching potato (after dedupe) ---");
  for (const r of potato) {
    console.log(r);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
