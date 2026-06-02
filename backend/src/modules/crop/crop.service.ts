import { CropRepository } from "./crop.repository.js";
import { SELECTED_CROPS } from "../../config/selectedCrops.js";

export class CropService {
  constructor(private readonly repo: CropRepository) {}

  async listItems(): Promise<string[]> {
    return this.repo.listDistinctItems();
  }

  async listTopItems(limit: number): Promise<string[]> {
    return this.repo.topItemsPopularThenByVolume(limit);
  }

  async getLatestSnapshot(): Promise<Array<{ item_name: string; min_price: number; max_price: number; avg_price: number; date: string }>> {
    const rows = await this.repo.latestPrices();
    return rows.map((r) => ({
      item_name: r.item_name,
      min_price: r.min_price,
      max_price: r.max_price,
      avg_price: r.avg_price,
      date: new Date(r.date).toISOString(),
    }));
  }

  async listFeaturedItems(): Promise<string[]> {
    const items = await this.repo.listDistinctItems();
    const available = new Set(items);
    return [...SELECTED_CROPS].filter((c) => available.has(c));
  }

  async getCurrentForItem(itemName: string) {
    const doc = await this.repo.latestForItem(itemName);
    if (!doc) return null;
    return {
      item_name: doc.item_name,
      min_price: doc.min_price,
      max_price: doc.max_price,
      avg_price: doc.avg_price,
      date: new Date(doc.date).toISOString(),
    };
  }
}
