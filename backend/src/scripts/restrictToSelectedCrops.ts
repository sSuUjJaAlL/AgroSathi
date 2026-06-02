import { connectDatabase } from "../config/database.js";
import { CropPrice } from "../models/CropPrice.js";
import { Prediction } from "../models/Prediction.js";
import { SELECTED_CROPS } from "../config/selectedCrops.js";

type CropRange = { item: string; count: number; minDate: string | null; maxDate: string | null };

async function rangesForSelected(): Promise<CropRange[]> {
  const out: CropRange[] = [];
  for (const item of SELECTED_CROPS) {
    const stats = await CropPrice.aggregate<{ _id: null; c: number; minD: Date; maxD: Date }>([
      { $match: { item_name: item } },
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

  const before = await CropPrice.countDocuments();
  const beforeRanges = await rangesForSelected();

  const cropDelete = await CropPrice.deleteMany({ item_name: { $nin: [...SELECTED_CROPS] } });
  const predDelete = await Prediction.deleteMany({ item_name: { $nin: [...SELECTED_CROPS] } });

  const after = await CropPrice.countDocuments();
  const afterRanges = await rangesForSelected();

  console.log("[Restrict] Selected crops:", [...SELECTED_CROPS].join(", "));
  console.log("[Restrict] Crop rows before cleanup:", before);
  console.log("[Restrict] Crop rows deleted:", cropDelete.deletedCount ?? 0);
  console.log("[Restrict] Prediction rows deleted:", predDelete.deletedCount ?? 0);
  console.log("[Restrict] Crop rows after cleanup:", after);
  console.log("[Restrict] Date range per crop (before):");
  console.table(beforeRanges);
  console.log("[Restrict] Date range per crop (after):");
  console.table(afterRanges);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

