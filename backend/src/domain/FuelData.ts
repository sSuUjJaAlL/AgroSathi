import { FuelPrice, type FuelType } from "../models/FuelPrice.js";
import { FuelData as FuelDataModel } from "../models/FuelData.js";
import type { PipelineStage } from "mongoose";

export interface FuelDaySnapshot {
  date: string;
  petrol_price: number;
  diesel_price: number;
  kerosene_price: number | null;
  lpg_price: number | null;
}

export interface FuelLatest {
  date: string;
  petrol: number | null;
  diesel: number | null;
  kerosene: number | null;
  lpg: number | null;
}

/**
 * Domain model (class diagram): fuel price persistence and queries.
 */
export class FuelData {
  date?: Date;
  petrol_price?: number;
  diesel_price?: number;

  private async pivotByDateRange(start?: Date, end?: Date, limit?: number): Promise<FuelDaySnapshot[]> {
    const pipeline: PipelineStage[] = [];
    if (start || end) {
      const dateFilter: Record<string, Date> = {};
      if (start) dateFilter.$gte = start;
      if (end) dateFilter.$lte = end;
      pipeline.push({ $match: { date: dateFilter } });
    }
    pipeline.push({ $sort: { date: -1 } });
    pipeline.push({
      $group: {
        _id: "$date",
        petrol_price: { $max: { $cond: [{ $eq: ["$fuel_type", "petrol"] }, "$price_npr", null] } },
        diesel_price: { $max: { $cond: [{ $eq: ["$fuel_type", "diesel"] }, "$price_npr", null] } },
        kerosene_price: { $max: { $cond: [{ $eq: ["$fuel_type", "kerosene"] }, "$price_npr", null] } },
        lpg_price: { $max: { $cond: [{ $eq: ["$fuel_type", "lpg"] }, "$price_npr", null] } },
      },
    });
    pipeline.push({ $sort: { _id: -1 } });
    if (typeof limit === "number") pipeline.push({ $limit: limit });

    const rows = await FuelPrice.aggregate<{
      _id: Date;
      petrol_price: number | null;
      diesel_price: number | null;
      kerosene_price: number | null;
      lpg_price: number | null;
    }>(pipeline);

    return rows.map((r) => ({
      date: new Date(r._id).toISOString(),
      petrol_price: r.petrol_price ?? 0,
      diesel_price: r.diesel_price ?? 0,
      kerosene_price: r.kerosene_price ?? null,
      lpg_price: r.lpg_price ?? null,
    }));
  }

  async latest(): Promise<FuelDaySnapshot | null> {
    const tip = await FuelPrice.findOne().sort({ date: -1 }).select("date").lean();
    if (!tip) {
      const old = await FuelDataModel.findOne().sort({ date: -1 }).lean();
      if (!old) return null;
      return {
        date: new Date(old.date).toISOString(),
        petrol_price: old.petrol_price,
        diesel_price: old.diesel_price,
        kerosene_price: null,
        lpg_price: null,
      };
    }
    const latest = await this.pivotByDateRange(new Date(tip.date), new Date(tip.date), 1);
    return latest[0] ?? null;
  }

  async findRecent(limit = 90): Promise<FuelDaySnapshot[]> {
    const latest = await this.pivotByDateRange(undefined, undefined, limit);
    if (!latest.length) {
      const rows = await FuelDataModel.find().sort({ date: -1 }).limit(limit).lean();
      return rows.map((r) => ({
        date: new Date(r.date).toISOString(),
        petrol_price: r.petrol_price,
        diesel_price: r.diesel_price,
        kerosene_price: null,
        lpg_price: null,
      }));
    }
    return latest;
  }

  async findByRange(from?: Date, to?: Date, fuelType?: FuelType) {
    const filter: Record<string, unknown> = {};
    if (fuelType) filter.fuel_type = fuelType;
    if (from || to) {
      filter.date = {};
      if (from) (filter.date as Record<string, Date>).$gte = from;
      if (to) (filter.date as Record<string, Date>).$lte = to;
    }
    const rows = await FuelPrice.find(filter).sort({ date: -1 }).lean();
    return rows.map((r) => ({
      date: new Date(r.date).toISOString(),
      fuel_type: r.fuel_type,
      price_npr: r.price_npr,
      source: r.source,
    }));
  }

  async findWindowLatestYear(startMonth: number, startDay: number, endMonth: number, endDay: number): Promise<FuelDaySnapshot[]> {
    const tip = await FuelPrice.findOne().sort({ date: -1 }).select("date").lean();
    if (!tip?.date) return [];
    const year = new Date(tip.date).getUTCFullYear();
    const start = new Date(Date.UTC(year, startMonth - 1, startDay, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, endMonth - 1, endDay, 23, 59, 59, 999));
    const rows = await this.pivotByDateRange(start, end);
    return rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  async latestByType(): Promise<FuelLatest> {
    const types: FuelType[] = ["petrol", "diesel", "kerosene", "lpg"];
    const results = await Promise.all(types.map((t) => FuelPrice.findOne({ fuel_type: t }).sort({ date: -1 }).lean()));
    const [petrol, diesel, kerosene, lpg] = results;
    const latestDate =
      [petrol, diesel, kerosene, lpg]
        .filter(Boolean)
        .map((r) => new Date(r!.date).getTime())
        .sort((a, b) => b - a)[0] ?? null;

    return {
      date: latestDate ? new Date(latestDate).toISOString() : new Date().toISOString(),
      petrol: petrol?.price_npr ?? null,
      diesel: diesel?.price_npr ?? null,
      kerosene: kerosene?.price_npr ?? null,
      lpg: lpg?.price_npr ?? null,
    };
  }

  async upsertMany(rows: Array<{ date: Date; fuel_type: FuelType; price_npr: number; source: string }>): Promise<number> {
    if (!rows.length) return 0;
    const BATCH_SIZE = 500;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await FuelPrice.bulkWrite(
        batch.map((r) => ({
          updateOne: {
            filter: { date: r.date, fuel_type: r.fuel_type },
            update: { $set: { price_npr: r.price_npr, source: r.source } },
            upsert: true,
          },
        }))
      );
    }
    return rows.length;
  }
}
