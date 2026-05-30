import type { Request, Response } from "express";
import { FuelService } from "./fuel.service.js";

export class FuelController {
  constructor(private readonly service: FuelService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { from, to, type } = req.query as Record<string, string>;
    const data = await this.service.listByRange(from, to, type);
    res.json({ fuel: data });
  };

  latest = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.service.latestPanel();
    res.json(data);
  };

  latestSnapshot = async (_req: Request, res: Response): Promise<void> => {
    const snap = await this.service.latestSnapshot();
    if (!snap) {
      res.status(404).json({ message: "No fuel price data. Run seed:fuel script." });
      return;
    }
    res.json(snap);
  };

  impact = async (req: Request, res: Response): Promise<void> => {
    const crop = decodeURIComponent(req.params.crop || "");
    if (!crop) {
      res.status(400).json({ message: "crop param required" });
      return;
    }
    const result = await this.service.dieselCropCorrelation(crop);
    res.json(result);
  };
}
