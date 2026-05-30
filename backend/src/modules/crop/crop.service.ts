import { CropRepository } from "./crop.repository.js";
import { FEATURED_CROP_KEYWORDS } from "../../config/featuredCrops.js";

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
    const pool = await this.repo.topItemsByRecordCount(300);
    const result: string[] = [];
    const seen = new Set<string>();
    for (const kw of FEATURED_CROP_KEYWORDS) {
      const match = pool.find((name) => name.toLowerCase().includes(kw));
      if (match && !seen.has(match)) {
        result.push(match);
        seen.add(match);
      }
    }
    return result;
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
