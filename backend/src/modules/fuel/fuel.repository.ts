import { FuelPrice, type FuelType } from "../../models/FuelPrice.js";
import { FuelData } from "../../models/FuelData.js";

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

export class FuelRepository {
  /** Latest date that has at least one fuel_prices record. */
  async latest(): Promise<FuelDaySnapshot | null> {
    const tip = await FuelPrice.findOne().sort({ date: -1 }).select("date").lean();
    if (!tip) {
      // fallback to old fuel_data collection
      const old = await FuelData.findOne().sort({ date: -1 }).lean();
      if (!old) return null;
      return {
        date: new Date(old.date).toISOString(),
        petrol_price: old.petrol_price,
        diesel_price: old.diesel_price,
        kerosene_price: null,
        lpg_price: null,
      };
    }
    return this._pivotDay(tip.date);
  }

  /** Most recent N distinct dates, pivoted to one row per date. */
  async findRecent(limit = 90): Promise<FuelDaySnapshot[]> {
    const dates = await FuelPrice.aggregate<{ _id: Date }>([
      { $sort: { date: -1 } },
      { $group: { _id: "$date" } },
      { $sort: { _id: -1 } },
      { $limit: limit },
    ]);
    if (!dates.length) {
      // fallback to old collection
      const rows = await FuelData.find().sort({ date: -1 }).limit(limit).lean();
      return rows.map((r) => ({
        date: new Date(r.date).toISOString(),
        petrol_price: r.petrol_price,
        diesel_price: r.diesel_price,
        kerosene_price: null,
        lpg_price: null,
      }));
    }
    const snapshots = await Promise.all(dates.map((d) => this._pivotDay(d._id)));
    return snapshots.filter(Boolean) as FuelDaySnapshot[];
  }

  /** Prices filtered by date range and optional fuel type. */
  async findByRange(from?: Date, to?: Date, fuelType?: FuelType): Promise<Array<{ date: string; fuel_type: string; price_npr: number; source: string }>> {
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

  /** Latest price per fuel type. */
  async latestByType(): Promise<FuelLatest> {
    const types: FuelType[] = ["petrol", "diesel", "kerosene", "lpg"];
    const results = await Promise.all(
      types.map((t) =>
        FuelPrice.findOne({ fuel_type: t }).sort({ date: -1 }).lean()
      )
    );
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
    let count = 0;
    for (const r of rows) {
      await FuelPrice.updateOne(
        { date: r.date, fuel_type: r.fuel_type },
        { $set: { price_npr: r.price_npr, source: r.source } },
        { upsert: true }
      );
      count++;
    }
    return count;
  }

  private async _pivotDay(date: Date): Promise<FuelDaySnapshot | null> {
    const rows = await FuelPrice.find({ date }).lean();
    if (!rows.length) return null;
    const byType = Object.fromEntries(rows.map((r) => [r.fuel_type, r.price_npr]));
    return {
      date: new Date(date).toISOString(),
      petrol_price: byType.petrol ?? 0,
      diesel_price: byType.diesel ?? 0,
      kerosene_price: byType.kerosene ?? null,
      lpg_price: byType.lpg ?? null,
    };
  }
}
