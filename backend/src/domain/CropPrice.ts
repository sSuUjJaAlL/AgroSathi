import { CropPrice as CropPriceModel } from "../models/CropPrice.js";
import { SELECTED_CROPS } from "../config/selectedCrops.js";

/**
 * Domain model (class diagram): crop price persistence and queries.
 */
export class CropPrice {
  date?: Date;
  item_name?: string;
  min_price?: number;
  max_price?: number;
  avg_price?: number;

  async upsertMany(
    rows: Array<{ date: Date; item_name: string; min_price: number; max_price: number; avg_price: number }>
  ): Promise<number> {
    if (!rows.length) return 0;
    const BATCH_SIZE = 1000;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await CropPriceModel.bulkWrite(
        batch.map((r) => ({
          updateOne: {
            filter: { date: r.date, item_name: r.item_name },
            update: { $set: r },
            upsert: true,
          },
        }))
      );
    }
    return rows.length;
  }

  async latestForItem(itemName: string) {
    if (![...SELECTED_CROPS].includes(itemName as (typeof SELECTED_CROPS)[number])) return null;
    return CropPriceModel.findOne({ item_name: itemName }).sort({ date: -1 }).lean();
  }

  async historyForItem(itemName: string, days: number) {
    const end = await CropPriceModel.findOne({ item_name: itemName }).sort({ date: -1 }).select("date").lean();
    if (!end?.date) return [];
    const endDate = new Date(end.date);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(12, 0, 0, 0);
    const rows = await CropPriceModel.find({
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
    return CropPriceModel.countDocuments();
  }

  async listDistinctItems(): Promise<string[]> {
    const items = await CropPriceModel.distinct("item_name", { item_name: { $in: [...SELECTED_CROPS] } });
    return items.sort();
  }

  async latestPrices(limit = 200) {
    const latestDate = await CropPriceModel.findOne().sort({ date: -1 }).select("date").lean();
    if (!latestDate?.date) return [];
    return CropPriceModel.find({ date: latestDate.date, item_name: { $in: [...SELECTED_CROPS] } })
      .sort({ item_name: 1 })
      .limit(limit)
      .lean();
  }

  async topItemsByRecordCount(limit: number): Promise<string[]> {
    const capped = Math.min(150, Math.max(1, limit));
    const rows = await CropPriceModel.aggregate<{ _id: string }>([
      { $group: { _id: "$item_name", c: { $sum: 1 } } },
      { $match: { _id: { $in: [...SELECTED_CROPS] } } },
      { $sort: { c: -1, _id: 1 } },
      { $limit: capped },
    ]);
    return rows.map((r) => r._id);
  }

  async topItemsPopularThenByVolume(limit: number): Promise<string[]> {
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
