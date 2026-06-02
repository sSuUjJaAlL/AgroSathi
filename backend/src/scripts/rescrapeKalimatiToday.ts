/**
 * Force re-scrape today's official Kalimati prices into kalimati_prices (generated: false).
 * Use after parser fixes when today's row has wrong min/max/avg.
 *
 *   npx tsx src/scripts/rescrapeKalimatiToday.ts
 */
import { connectDatabase } from "../config/database.js";
import { SELECTED_CROPS } from "../config/selectedCrops.js";
import { KalimatiPrice } from "../models/KalimatiPrice.js";
import { CropRepository } from "../modules/crop/crop.repository.js";
import { scrapeKalimatiPrices } from "../scraper/kalimati.scraper.js";

function todayUtc(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function main() {
  await connectDatabase();
  const date = todayUtc();
  const iso = date.toISOString().slice(0, 10);

  const del = await KalimatiPrice.deleteMany({
    commodityEnglish: { $in: [...SELECTED_CROPS] },
    date,
  });
  console.log(`[Rescrape] Deleted ${del.deletedCount ?? 0} existing row(s) for ${iso}.`);

  const { rows, meta } = await scrapeKalimatiPrices();
  console.log("[Rescrape] Listing:", meta.listing_heading ?? "(none)");
  console.log("[Rescrape] Parsed rows:", rows.length);

  const repo = new CropRepository();
  const payload = rows.map((r) => ({
    date,
    item_name: r.item_name,
    min_price: r.min_price,
    max_price: r.max_price,
    avg_price: r.avg_price,
    unit: r.unit,
    source: "Kalimati live scrape",
  }));
  const saved = await repo.upsertMany(payload);
  console.log(`[Rescrape] Upserted ${saved} row(s).`);

  const potato = await KalimatiPrice.findOne({
    commodityEnglish: "Red potato (round)",
    date,
  }).lean();
  if (potato) {
    console.log("[Rescrape] Red potato (round) verify:", {
      minimumPrice: potato.minimumPrice,
      maximumPrice: potato.maximumPrice,
      averagePrice: potato.averagePrice,
      generated: potato.generated,
    });
  } else {
    console.warn("[Rescrape] Red potato (round) not found after upsert.");
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
