import { KalimatiPrice as KalimatiPriceModel } from "../models/KalimatiPrice.js";
import {
  SELECTED_CROPS,
  COMMODITY_NEPALI,
  resolveSelectedCrop,
  type SelectedCrop,
} from "../config/selectedCrops.js";

type CropRow = {
  date: Date;
  item_name: string;
  min_price: number;
  max_price: number;
  avg_price: number;
};

function mapDoc(doc: {
  commodityEnglish: string;
  date: Date;
  minimumPrice: number;
  maximumPrice: number;
  averagePrice: number;
}): CropRow {
  return {
    date: doc.date,
    item_name: doc.commodityEnglish,
    min_price: doc.minimumPrice,
    max_price: doc.maximumPrice,
    avg_price: doc.averagePrice,
  };
}

/**
 * Domain model: crop price persistence and queries (`kalimati_prices` collection).
 */
export class CropPrice {
  async upsertMany(
    rows: Array<{
      date: Date;
      item_name: string;
      min_price: number;
      max_price: number;
      avg_price: number;
      unit?: string;
      source?: string;
    }>
  ): Promise<number> {
    if (!rows.length) return 0;
    let debugLogged = 0;
    const ops = [];
    for (const r of rows) {
      const canon = resolveSelectedCrop(r.item_name);
      if (!canon) continue;
      if (debugLogged < 20) {
        console.log(
          JSON.stringify({
            commodity: canon,
            minimumPrice: r.min_price,
            maximumPrice: r.max_price,
            averagePrice: r.avg_price,
          })
        );
        debugLogged++;
      }
      ops.push({
        updateOne: {
          filter: { date: r.date, commodityEnglish: canon },
          update: {
            $set: {
              date: r.date,
              commodityEnglish: canon,
              commodityNepali: COMMODITY_NEPALI[canon],
              minimumPrice: r.min_price,
              maximumPrice: r.max_price,
              averagePrice: r.avg_price,
              unit: r.unit ?? "Kg",
              generated: false,
              source: r.source ?? "Kalimati",
            },
          },
          upsert: true,
        },
      });
    }
    if (!ops.length) return 0;
    const BATCH_SIZE = 1000;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      await KalimatiPriceModel.bulkWrite(ops.slice(i, i + BATCH_SIZE));
    }
    return ops.length;
  }

  async latestForItem(itemName: string) {
    const canon = resolveSelectedCrop(itemName);
    if (!canon) return null;
    const doc =
      (await KalimatiPriceModel.findOne({ commodityEnglish: canon, generated: false })
        .sort({ date: -1 })
        .lean()) ??
      (await KalimatiPriceModel.findOne({ commodityEnglish: canon }).sort({ date: -1 }).lean());
    return doc ? mapDoc(doc) : null;
  }

  async historyForItem(itemName: string, days: number) {
    const canon = resolveSelectedCrop(itemName);
    if (!canon) return [];
    const end = await KalimatiPriceModel.findOne({ commodityEnglish: canon })
      .sort({ date: -1 })
      .select("date")
      .lean();
    if (!end?.date) return [];
    const endDate = new Date(end.date);
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
    startDate.setUTCHours(12, 0, 0, 0);
    const rows = await KalimatiPriceModel.find({
      commodityEnglish: canon,
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: 1 })
      .lean();
    return rows.map((r) => ({
      date: new Date(r.date).toISOString(),
      avg_price: r.averagePrice,
      min_price: r.minimumPrice,
      max_price: r.maximumPrice,
    }));
  }

  async countDocuments(): Promise<number> {
    return KalimatiPriceModel.countDocuments({ commodityEnglish: { $in: [...SELECTED_CROPS] } });
  }

  async listDistinctItems(): Promise<string[]> {
    const items = await KalimatiPriceModel.distinct("commodityEnglish", {
      commodityEnglish: { $in: [...SELECTED_CROPS] },
    });
    return (items as SelectedCrop[]).sort();
  }

  async latestPrices(limit = 200) {
    const latestDate = await KalimatiPriceModel.findOne({ commodityEnglish: { $in: [...SELECTED_CROPS] } })
      .sort({ date: -1 })
      .select("date")
      .lean();
    if (!latestDate?.date) return [];
    const rows = await KalimatiPriceModel.find({
      date: latestDate.date,
      commodityEnglish: { $in: [...SELECTED_CROPS] },
    })
      .sort({ commodityEnglish: 1 })
      .limit(limit)
      .lean();
    return rows.map(mapDoc);
  }

  async topItemsByRecordCount(limit: number): Promise<string[]> {
    const capped = Math.min(150, Math.max(1, limit));
    const rows = await KalimatiPriceModel.aggregate<{ _id: string }>([
      { $match: { commodityEnglish: { $in: [...SELECTED_CROPS] } } },
      { $group: { _id: "$commodityEnglish", c: { $sum: 1 } } },
      { $sort: { c: -1, _id: 1 } },
      { $limit: capped },
    ]);
    return rows.map((r) => r._id);
  }

  async topItemsPopularThenByVolume(limit: number): Promise<string[]> {
    const capped = Math.min(100, Math.max(1, limit));
    return [...SELECTED_CROPS].slice(0, capped);
  }
}
