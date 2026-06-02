import { connectDatabase } from "../config/database.js";
import { KalimatiPrice } from "../models/KalimatiPrice.js";
import { Prediction } from "../models/Prediction.js";
import { SELECTED_CROPS } from "../config/selectedCrops.js";

type CropRange = { item: string; count: number; minDate: string | null; maxDate: string | null };

async function rangesForSelected(): Promise<CropRange[]> {
  const out: CropRange[] = [];
  for (const item of SELECTED_CROPS) {
    const stats = await KalimatiPrice.aggregate<{ _id: null; c: number; minD: Date; maxD: Date }>([
      { $match: { commodityEnglish: item } },
      { $group: { _id: null, c: { $sum: 1 }, minD: { $min: "$date" }, maxD: { $max: "$date" } } },
    ]);
    if (!stats.length) {
      out.push({ item, count: 0, minDate: null, maxDate: null });
      continue;
    }
    out.push({
      item,
      count: stats[0].c,
      minDate: stats[0].minD ? new Date(stats[0].minD).toISOString().slice(0, 10) : null,
      maxDate: stats[0].maxD ? new Date(stats[0].maxD).toISOString().slice(0, 10) : null,
    });
  }
  return out;
}

async function main() {
  await connectDatabase();

  const before = await KalimatiPrice.countDocuments();
  const beforeRanges = await rangesForSelected();

  const cropDelete = await KalimatiPrice.deleteMany({ commodityEnglish: { $nin: [...SELECTED_CROPS] } });
  const predDelete = await Prediction.deleteMany({ item_name: { $nin: [...SELECTED_CROPS] } });

  const after = await KalimatiPrice.countDocuments();
  const afterRanges = await rangesForSelected();

  console.log("[Restrict] Selected commodities:", [...SELECTED_CROPS].join(", "));
  console.log("[Restrict] Kalimati rows before cleanup:", before);
  console.log("[Restrict] Kalimati rows deleted:", cropDelete.deletedCount ?? 0);
  console.log("[Restrict] Prediction rows deleted:", predDelete.deletedCount ?? 0);
  console.log("[Restrict] Kalimati rows after cleanup:", after);
  console.log("[Restrict] Date range per commodity (before):");
  console.table(beforeRanges);
  console.log("[Restrict] Date range per commodity (after):");
  console.table(afterRanges);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
