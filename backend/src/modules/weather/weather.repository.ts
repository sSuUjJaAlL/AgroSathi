import { WeatherData } from "../../models/WeatherData.js";

export class WeatherRepository {
  async findRecent(limit = 90) {
    return WeatherData.find().sort({ date: -1 }).limit(limit).lean();
  }

  async latest() {
    return WeatherData.findOne().sort({ date: -1 }).lean();
  }
}
