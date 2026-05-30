import { CropPrice } from "../../models/CropPrice.js";

/**
 * Substrings matched against Kalimati-style `item_name` (case-insensitive).
 * Ordered: staples first, then other common veg/fruit. Only names that exist in DB are included.
 */
const POPULAR_ITEM_KEYWORDS = [
  "tomato",
  "potato",
  "onion",
  "apple",
  "banana",
  "orange",
  "grape",
  "mango",
  "papaya",
  "cauli",
  "cabbage",
  "carrot",
  "bean",
  "peas",
  "garlic",
  "ginger",
  "chilli",
  "capsicum",
  "cucumber",
  "pumpkin",
  "spinach",
  "lettuce",
  "brinjal",
  "okra",
  "lime",
  "lemon",
  "pomegranate",
  "water melon",
  "pineapple",
] as const;

export class CropRepository {
  async upsertMany(
    rows: Array<{ date: Date; item_name: string; min_price: number; max_price: number; avg_price: number }>
  ): Promise<number> {
    let inserted = 0;
    for (const r of rows) {
      await CropPrice.updateOne(
        { date: r.date, item_name: r.item_name },
        { $set: r },
        { upsert: true }
      );
      inserted++;
    }
    return inserted;
  }

  async listDistinctItems(): Promise<string[]> {
    const items = await CropPrice.distinct("item_name");
    return items.sort();
  }

  async latestForItem(itemName: string) {
    return CropPrice.findOne({ item_name: itemName }).sort({ date: -1 }).lean();
  }

  async latestPrices(limit = 200) {
    const latestDate = await CropPrice.findOne().sort({ date: -1 }).select("date").lean();
    if (!latestDate?.date) return [];
    return CropPrice.find({ date: latestDate.date }).sort({ item_name: 1 }).limit(limit).lean();
  }

  /** Last `days` calendar rows for one commodity (by latest known date for that item). */
  async historyForItem(itemName: string, days: number) {
    const end = await CropPrice.findOne({ item_name: itemName }).sort({ date: -1 }).select("date").lean();
    if (!end?.date) return [];
    const endDate = new Date(end.date);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(12, 0, 0, 0);
    const rows = await CropPrice.find({
      item_name: itemName,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean();
    return rows.map((r) => ({
      date: new Date(r.date).toISOString(),
      avg_price: r.avg_price,
      min_price: r.min_price,
      max_price: r.max_price,
    }));
  }

  async countDocuments(): Promise<number> {
    return CropPrice.countDocuments();
  }

  /** Most frequent commodities in `crop_prices` (stable tie-break: name ascending). */
  async topItemsByRecordCount(limit: number): Promise<string[]> {
    const capped = Math.min(150, Math.max(1, limit));
    const rows = await CropPrice.aggregate<{ _id: string }>([
      { $group: { _id: "$item_name", c: { $sum: 1 } } },
      { $sort: { c: -1, _id: 1 } },
      { $limit: capped },
    ]);
    return rows.map((r) => r._id);
  }

  /**
   * Top-N for dashboards: prefer popular veg/fruit (tomato, potato, …) using highest-volume
   * matching product name, then fill with remaining commodities by record count.
   */
  async topItemsPopularThenByVolume(limit: number): Promise<string[]> {
    const capped = Math.min(100, Math.max(1, limit));
    const poolSize = Math.min(150, Math.max(capped * 8, 40));
    const pool = await this.topItemsByRecordCount(poolSize);

    const picked: string[] = [];
    const seen = new Set<string>();

    for (const kw of POPULAR_ITEM_KEYWORDS) {
      if (picked.length >= capped) break;
      const match = pool.find((name) => name.toLowerCase().includes(kw));
      if (match && !seen.has(match)) {
        picked.push(match);
        seen.add(match);
      }
    }

    for (const name of pool) {
      if (picked.length >= capped) break;
      if (!seen.has(name)) {
        picked.push(name);
        seen.add(name);
      }
    }

    return picked.slice(0, capped);
  }
}
