import axios from "axios";
import * as cheerio from "cheerio";
import { parseKalimatiHtml } from "../scraper/kalimati.scraper.js";
import { COMMODITY_NEPALI, SELECTED_CROPS } from "../config/selectedCrops.js";

const URL = "https://kalimatimarket.gov.np/price";

function norm(s: string): string {
  return s.replace(/\s+/g, "").replace(/[()]/g, "").toLowerCase();
}

async function main() {
  const { data: html } = await axios.get(URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const $ = cheerio.load(html);
  const table = $("#commodityPriceParticular");

  console.log("Selected crops — rows that map to each canonical name:\n");
  for (const crop of SELECTED_CROPS) {
    const nepali = COMMODITY_NEPALI[crop];
    const nNep = norm(nepali);
    console.log(`=== ${crop} (Nepali: ${nepali}) ===`);
    table.find("tbody tr").each((_, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 5) return;
      const name = $(cells[0]).text().replace(/\s+/g, " ").trim();
      if (!name) return;
      const nName = norm(name);
      // loose: name contains key parts of nepali label
      const key = nNep.replace(/[ा-ौ]/g, ""); // skip - use includes on normalized
      if (nName.includes(norm("रातो")) && crop.includes("potato")) {
        /* handled below */
      }
      if (norm(name) === nNep || nName === nNep || name.includes(nepali.replace(/\s/g, "")) || nNep.includes(nName)) {
        const min = $(cells[2]).text().trim();
        const max = $(cells[3]).text().trim();
        const avg = $(cells[4]).text().trim();
        console.log(`  ROW: ${name} | min=${min} max=${max} avg=${avg}`);
      }
    });
  }

  console.log("\n--- All rows that translate to Potato Red ---");
  const { parseKalimatiHtml: parse } = await import("../scraper/kalimati.scraper.js");
  // show collision: parse intermediate
  const parsed = parseKalimatiHtml(html);
  for (const c of SELECTED_CROPS) {
    const r = parsed.rows.find((x) => x.item_name === c);
    if (r) console.log(`PARSED ${c}:`, r);
  }
}

main();
