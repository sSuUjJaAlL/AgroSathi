import type { Request, Response } from "express";
import { CropService } from "./crop.service.js";
import { resolveSelectedCrop } from "../../config/selectedCrops.js";

function formatDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

export class CropController {
  constructor(private readonly service: CropService) {}

  listItems = async (_req: Request, res: Response): Promise<void> => {
    const items = await this.service.listItems();
    res.json({ items });
  };

  listTopItems = async (req: Request, res: Response): Promise<void> => {
    const raw = Number(req.query.limit);
    const limit = Number.isFinite(raw) ? Math.min(250, Math.max(1, Math.floor(raw))) : 10;
    const items = await this.service.listTopItems(limit);
    res.json({ items, limit });
  };

  snapshot = async (_req: Request, res: Response): Promise<void> => {
    const rows = await this.service.getLatestSnapshot();
    res.json({
      section: "Crop Prices",
      total_records: rows.length,
      records: rows.map((row) => ({
        crop_name: row.item_name,
        date: formatDate(row.date),
        min_price_npr: row.min_price,
        avg_price_npr: row.avg_price,
        max_price_npr: row.max_price,
      })),
    });
  };

  listFeatured = async (_req: Request, res: Response): Promise<void> => {
    const items = await this.service.listFeaturedItems();
    res.json({ items });
  };

  currentItem = async (req: Request, res: Response): Promise<void> => {
    const raw = decodeURIComponent(req.params.item || "");
    const item = resolveSelectedCrop(raw);
    if (!item) {
      res.status(404).json({ message: "Commodity not in selected Kalimati list." });
      return;
    }
    const row = await this.service.getCurrentForItem(item);
    if (!row) {
      res.status(404).json({ message: "Item not found" });
      return;
    }
    res.json({
      section: "Crop Prices",
      record: {
        crop_name: row.item_name,
        date: formatDate(row.date),
        min_price_npr: row.min_price,
        avg_price_npr: row.avg_price,
        max_price_npr: row.max_price,
      },
    });
  };
}
