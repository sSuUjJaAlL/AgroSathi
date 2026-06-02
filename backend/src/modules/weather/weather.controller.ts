import type { Request, Response } from "express";
import { WeatherService } from "./weather.service.js";

function formatDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export class WeatherController {
  constructor(private readonly service: WeatherService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.service.listRecent();
    res.json({
      section: "Weather Data",
      total_records: data.length,
      records: data.map((row) => ({
        date: formatDate(row.date),
        temperature_c: row.temperature,
        humidity_pct: row.humidity,
        rainfall_mm: row.rainfall,
      })),
    });
  };
}
