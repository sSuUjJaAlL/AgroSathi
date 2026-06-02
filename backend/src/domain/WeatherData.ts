import { WeatherData as WeatherDataModel } from "../models/WeatherData.js";

/**
 * Domain model (class diagram): weather persistence and queries.
 */
export class WeatherData {
  date?: Date;
  temperature?: number;
  rainfall?: number;
  humidity?: number;

  async latest() {
    return WeatherDataModel.findOne().sort({ date: -1 }).lean();
  }

  async findRecent(limit = 90) {
    return WeatherDataModel.find().sort({ date: -1 }).limit(limit).lean();
  }

  async findByDateRange(start: Date, end: Date) {
    return WeatherDataModel.find({ date: { $gte: start, $lte: end } }).sort({ date: 1 }).lean();
  }

  async findWindowLatestYear(startMonth: number, startDay: number, endMonth: number, endDay: number) {
    const latest = await this.latest();
    if (!latest) return [];
    const year = new Date(latest.date).getUTCFullYear();
    const start = new Date(Date.UTC(year, startMonth - 1, startDay, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, endMonth - 1, endDay, 23, 59, 59, 999));
    return this.findByDateRange(start, end);
  }
}
