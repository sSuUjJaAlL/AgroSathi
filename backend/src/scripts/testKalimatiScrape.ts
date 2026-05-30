/**
 * Test Kalimati scraper against live HTML or a saved file.
 *
 * Usage:
 *   npm run test:scrape                    # fetch live https://kalimatimarket.gov.np/price
 *   npm run test:scrape -- --file ./snap.html
 *   npm run test:scrape -- --save          # write backend/tmp/kalimati-last.json
 */
import fs from "fs";
import path from "path";
import axios from "axios";
import { parseKalimatiHtml } from "../scraper/kalimati.scraper.js";

const KALIMATI_PRICE_URL = "https://kalimatimarket.gov.np/price";

function parseArgs() {
  const argv = process.argv.slice(2);
  let file: string | null = null;
  let save = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--file" && argv[i + 1]) {
      file = argv[++i];
    }
    if (argv[i] === "--save") save = true;
  }
  return { file, save };
}

function validateRows(rows: ReturnType<typeof parseKalimatiHtml>["rows"]) {
  let orderIssues = 0;
  let rangeIssues = 0;
  for (const r of rows) {
    if (r.min_price > r.max_price) orderIssues++;
    if (r.avg_price < r.min_price - 1e-6 || r.avg_price > r.max_price + 1e-6) rangeIssues++;
  }
  return { orderIssues, rangeIssues };
}

async function main() {
  const { file, save } = parseArgs();
  let html: string;
  let source: string;
  const fetchedAt = new Date().toISOString();

  if (file) {
    const resolved = path.resolve(process.cwd(), file);
    html = fs.readFileSync(resolved, "utf8");
    source = resolved;
  } else {
    const { data } = await axios.get<string>(KALIMATI_PRICE_URL, {
      timeout: 45000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });
    html = data;
    source = KALIMATI_PRICE_URL;
  }

  const result = parseKalimatiHtml(html, fetchedAt);
  const { rows, meta } = result;
  const checks = validateRows(rows);

  console.log("─ Kalimati scrape test ─────────────────────────────");
  console.log("Source:", source);
  console.log("Fetched:", meta.fetched_at);
  console.log("Listing heading:", meta.listing_heading ?? "(none)");
  console.log("Rows parsed:", rows.length);
  console.log("Checks — min>max rows:", checks.orderIssues, "| avg outside [min,max]:", checks.rangeIssues);

  const preview = rows.slice(0, 8);
  console.log("\nSample (up to 8):");
  for (const r of preview) {
    console.log(
      `  • ${r.item_name} [${r.unit}] min ${r.min_price} / max ${r.max_price} / avg ${r.avg_price}`
    );
  }

  if (save && rows.length) {
    const outDir = path.join(process.cwd(), "tmp");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "kalimati-last.json");
    fs.writeFileSync(
      outPath,
      JSON.stringify({ meta, rows, validation: checks }, null, 2),
      "utf8"
    );
    console.log("\nWrote:", outPath);
  }

  if (!rows.length) {
    console.error("\nFAIL: zero rows — table markup or numeral parsing may need an update.");
    process.exit(1);
  }
  if (checks.orderIssues > 0 || checks.rangeIssues > 0) {
    console.warn("\nWARN: some rows failed sanity checks (review raw page).");
  }

  console.log("\nOK.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
