import type { Request, Response } from "express";
import { CropService } from "./crop.service.js";

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
    res.json({ prices: rows });
  };

  listFeatured = async (_req: Request, res: Response): Promise<void> => {
    const items = await this.service.listFeaturedItems();
    res.json({ items });
  };

  currentItem = async (req: Request, res: Response): Promise<void> => {
    const item = decodeURIComponent(req.params.item || "");
    const row = await this.service.getCurrentForItem(item);
    if (!row) {
      res.status(404).json({ message: "Item not found" });
      return;
    }
    res.json(row);
  };
}
