import type { Request, Response } from "express";
import { DashboardService } from "./dashboard.service.js";

export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  get = async (req: Request, res: Response): Promise<void> => {
    const item = decodeURIComponent(req.params.item || "");
    const data = await this.service.buildDashboard(item);
    res.json(data);
  };
}
