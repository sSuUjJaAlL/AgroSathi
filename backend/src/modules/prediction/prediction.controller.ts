import type { Request, Response } from "express";
import { PredictionService } from "./prediction.service.js";
import { getCached, setCached } from "../../utils/simpleCache.js";
import { resolveSelectedCrop } from "../../config/selectedCrops.js";

export class PredictionController {
  constructor(private readonly service: PredictionService) {}

  sevenDays = async (req: Request, res: Response): Promise<void> => {
    const started = Date.now();
    const raw = decodeURIComponent(req.params.item || "");
    const item = resolveSelectedCrop(raw) ?? raw;
    const cacheKey = `predict:7d:${item}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      console.log(`[API] GET /api/predict/7days/${item} cache-hit total=${Date.now() - started}ms`);
      res.json(cached);
      return;
    }
    const data = await this.service.getForecastSeries(item, "7d");
    if (!data.batch_id) {
      res.status(404).json({ message: "No 7-day forecast yet. Run ML pipeline." });
      return;
    }
    const payload = { item, horizon: "7d", ...data };
    setCached(cacheKey, payload, 5 * 60 * 1000);
    console.log(`[API] GET /api/predict/7days/${item} total=${Date.now() - started}ms`);
    res.json(payload);
  };

  thirtyDays = async (req: Request, res: Response): Promise<void> => {
    const started = Date.now();
    const raw = decodeURIComponent(req.params.item || "");
    const item = resolveSelectedCrop(raw) ?? raw;
    const cacheKey = `predict:30d:${item}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      console.log(`[API] GET /api/predict/30days/${item} cache-hit total=${Date.now() - started}ms`);
      res.json(cached);
      return;
    }
    const data = await this.service.getForecastSeries(item, "30d");
    if (!data.batch_id) {
      res.status(404).json({ message: "No 30-day forecast yet. Run ML pipeline." });
      return;
    }
    const payload = { item, horizon: "30d", ...data };
    setCached(cacheKey, payload, 5 * 60 * 1000);
    console.log(`[API] GET /api/predict/30days/${item} total=${Date.now() - started}ms`);
    res.json(payload);
  };

  multiAlgo = async (req: Request, res: Response): Promise<void> => {
    const started = Date.now();
    const raw = decodeURIComponent(req.params.item || "");
    const item = resolveSelectedCrop(raw) ?? raw;
    const horizon = (req.query.horizon === "30d" ? "30d" : "7d") as "7d" | "30d";
    const cacheKey = `predict:multi:${item}:${horizon}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      console.log(`[API] GET /api/predict/multi/${item}?horizon=${horizon} cache-hit total=${Date.now() - started}ms`);
      res.json(cached);
      return;
    }
    const data = await this.service.getMultiAlgoForecast(item, horizon);
    setCached(cacheKey, data, 5 * 60 * 1000);
    console.log(`[API] GET /api/predict/multi/${item}?horizon=${horizon} total=${Date.now() - started}ms`);
    res.json(data);
  };
}
