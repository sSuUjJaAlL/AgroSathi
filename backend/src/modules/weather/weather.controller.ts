import type { Request, Response } from "express";
import { WeatherService } from "./weather.service.js";

export class WeatherController {
  constructor(private readonly service: WeatherService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.service.listRecent();
    res.json({ weather: data });
  };
}
