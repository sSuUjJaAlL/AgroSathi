import type { Request, Response } from "express";
import { DashboardService } from "./dashboard.service.js";
import { getCached, setCached } from "../../utils/simpleCache.js";

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  get = async (req: Request, res: Response): Promise<void> => {
    const started = Date.now();
    const item = decodeURIComponent(req.params.item || "");
    const cacheKey = `dashboard:${item}`;
    const cached = getCached<unknown>(cacheKey);
    if (cached) {
      console.log(`[API] GET /api/dashboard/${item} cache-hit total=${Date.now() - started}ms`);
      res.json(cached);
      return;
    }
    const data = await this.service.buildDashboard(item);
    setCached(cacheKey, data, 5 * 60 * 1000);
    console.log(`[API] GET /api/dashboard/${item} total=${Date.now() - started}ms`);
    res.json(data);
  };
}
