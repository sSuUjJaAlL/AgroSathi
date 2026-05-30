import type { Request, Response } from "express";
import { PredictionService } from "./prediction.service.js";

export class PredictionController {
  constructor(private readonly service: PredictionService) {}

  sevenDays = async (req: Request, res: Response): Promise<void> => {
    const item = decodeURIComponent(req.params.item || "");
    const data = await this.service.getForecastSeries(item, "7d");
    if (!data.batch_id) {
      res.status(404).json({ message: "No 7-day forecast yet. Run ML pipeline." });
      return;
    }
    res.json({ item, horizon: "7d", ...data });
  };

  thirtyDays = async (req: Request, res: Response): Promise<void> => {
    const item = decodeURIComponent(req.params.item || "");
    const data = await this.service.getForecastSeries(item, "30d");
    if (!data.batch_id) {
      res.status(404).json({ message: "No 30-day forecast yet. Run ML pipeline." });
      return;
    }
    res.json({ item, horizon: "30d", ...data });
  };

  multiAlgo = async (req: Request, res: Response): Promise<void> => {
    const item = decodeURIComponent(req.params.item || "");
    const horizon = (req.query.horizon === "30d" ? "30d" : "7d") as "7d" | "30d";
    const data = await this.service.getMultiAlgoForecast(item, horizon);
    res.json(data);
  };
}
