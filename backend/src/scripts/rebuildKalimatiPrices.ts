/**
 * Rebuild kalimati_prices from OFFICIAL Kalimati sources only (delegates to scrapeKalimatiOfficialOnly).
 *
 *   npm run rebuild:kalimati-prices
 *   npm run rebuild:kalimati-prices -- --from 2019-01-01
 */
import { connectDatabase } from "../config/database.js";
import { SELECTED_CROPS } from "../config/selectedCrops.js";
import { KalimatiPrice } from "../models/KalimatiPrice.js";
import { fetchAllOfficialKalimatiPrices } from "../scraper/kalimatiOfficialApi.js";

function parseFromArg(): Date | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--from" && argv[i + 1]) {
      return new Date(argv[++i] + "T12:00:00.000Z");
    }
  }
  return undefined;
}

async function main(): Promise<void> {
  const historyFrom = parseFromArg();
  console.log("[Kalimati Rebuild] Official site only — no mirror, no generated fill");

  await connectDatabase();
  const rows = await fetchAllOfficialKalimatiPrices({ historyFrom, includeLiveToday: true });

  if (!rows.length) {
    throw new Error("No official Kalimati prices fetched.");
  }

  await KalimatiPrice.deleteMany({ commodityEnglish: { $in: [...SELECTED_CROPS] } });

  const BATCH = 2000;
  for (let i = 0; i < rows.length; i += BATCH) {
    await KalimatiPrice.insertMany(rows.slice(i, i + BATCH), { ordered: false });
  }

  const total = await KalimatiPrice.countDocuments();
  console.log("[Kalimati Rebuild] Inserted", rows.length, "rows; collection total:", total);
  for (const crop of SELECTED_CROPS) {
    const n = await KalimatiPrice.countDocuments({ commodityEnglish: crop });
    const tip = await KalimatiPrice.findOne({ commodityEnglish: crop }).sort({ date: -1 }).select("date averagePrice source").lean();
    const old = await KalimatiPrice.findOne({ commodityEnglish: crop }).sort({ date: 1 }).select("date").lean();
    console.log(
      `  ${crop}: ${n} rows` +
        (old?.date && tip?.date
          ? ` ${old.date.toISOString().slice(0, 10)} → ${tip.date.toISOString().slice(0, 10)} (latest avg ${tip.averagePrice}, ${tip.source})`
          : "")
    );
  }
}

main().catch((e) => {
  console.error("[Kalimati Rebuild] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
