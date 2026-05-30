import { WeatherRepository } from "./weather.repository.js";

export class WeatherService {
  constructor(private readonly repo: WeatherRepository) {}

  async listRecent() {
    const rows = await this.repo.findRecent();
    return rows.map((r) => ({
      date: new Date(r.date).toISOString(),
      temperature: r.temperature,
      rainfall: r.rainfall,
      humidity: r.humidity,
    }));
  }

  async latestPanel() {
    const r = await this.repo.latest();
    if (!r) return null;
    return {
      date: new Date(r.date).toISOString(),
      temperature: r.temperature,
      rainfall: r.rainfall,
      humidity: r.humidity,
    };
  }
}
