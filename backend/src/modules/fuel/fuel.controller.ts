import type { Request, Response } from "express";
import { FuelService } from "./fuel.service.js";

function formatDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export class FuelController {
  constructor(private readonly service: FuelService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const { from, to, type } = req.query as Record<string, string>;
    const data = await this.service.listByRange(from, to, type);
    res.json({
      section: "Fuel Prices",
      total_records: data.length,
      records: data.map((row) => ({
        date: formatDate(row.date),
        fuel_type: row.fuel_type,
        price_npr: row.price_npr,
      })),
    });
  };

  latest = async (_req: Request, res: Response): Promise<void> => {
    const data = await this.service.latestPanel();
    res.json({
      section: "Fuel Prices",
      latest_snapshot: {
        date: formatDate(data.date),
        petrol_npr: data.petrol,
        diesel_npr: data.diesel,
        kerosene_npr: data.kerosene,
        lpg_npr: data.lpg,
      },
    });
  };

  latestSnapshot = async (_req: Request, res: Response): Promise<void> => {
    const snap = await this.service.latestSnapshot();
    if (!snap) {
      res.status(404).json({ message: "No fuel price data. Run seed:fuel script." });
      return;
    }
    res.json({
      section: "Fuel Prices",
      latest_snapshot: {
        date: formatDate(snap.date),
        petrol_npr: snap.petrol_price,
        diesel_npr: snap.diesel_price,
        kerosene_npr: snap.kerosene_price,
        lpg_npr: snap.lpg_price,
      },
    });
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
