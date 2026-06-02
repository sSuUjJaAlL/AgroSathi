import { KalimatiPrice } from "../../models/KalimatiPrice.js";
import { FuelPrice } from "../../models/FuelPrice.js";
import { resolveSelectedCrop } from "../../config/selectedCrops.js";
import { FuelRepository, type FuelDaySnapshot } from "./fuel.repository.js";

export class FuelService {
  constructor(private readonly repo: FuelRepository) {}

  async listRecent() {
    return this.repo.findRecent(90);
  }

  async latestPanel() {
    return this.repo.latestByType();
  }

  async listByRange(from?: string, to?: string, type?: string) {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    const fuelType = (["petrol", "diesel", "kerosene", "lpg"].includes(type ?? "") ? type : undefined) as
      | "petrol"
      | "diesel"
      | "kerosene"
      | "lpg"
      | undefined;
    return this.repo.findByRange(fromDate, toDate, fuelType);
  }

  async latestSnapshot(): Promise<FuelDaySnapshot | null> {
    return this.repo.latest();
  }

  /** Pearson correlation between diesel price and avg_price for a crop. */
  async dieselCropCorrelation(crop: string): Promise<{ crop: string; correlation: number; interpretation: string }> {
    const canon = resolveSelectedCrop(crop);
    if (!canon) {
      return { crop, correlation: 0, interpretation: "Unknown commodity" };
    }
    const cropDocs = await KalimatiPrice.find({ commodityEnglish: canon })
      .sort({ date: 1 })
      .select("date averagePrice")
      .lean();
    if (cropDocs.length < 30) {
      return { crop, correlation: 0, interpretation: "Insufficient data" };
    }

    const dieselDocs = await FuelPrice.find({ fuel_type: "diesel" }).sort({ date: 1 }).lean();
    if (dieselDocs.length < 10) {
      return { crop, correlation: 0, interpretation: "No diesel history" };
    }

    // Build diesel lookup by normalized date string
    const dieselByDate = new Map(
      dieselDocs.map((d) => [new Date(d.date).toISOString().slice(0, 10), d.price_npr])
    );

    // Forward-fill diesel for each crop date
    const pairs: Array<{ crop: number; diesel: number }> = [];
    let lastDiesel: number | null = null;

    for (const doc of cropDocs) {
      const dateKey = new Date(doc.date).toISOString().slice(0, 10);
      const diesel: number | null = dieselByDate.get(dateKey) ?? lastDiesel;
      if (diesel != null) {
        lastDiesel = diesel;
        pairs.push({ crop: doc.averagePrice, diesel });
      }
    }

    if (pairs.length < 20) {
      return { crop, correlation: 0, interpretation: "Insufficient overlapping dates" };
    }

    const n = pairs.length;
    const sumX = pairs.reduce((s, p) => s + p.diesel, 0);
    const sumY = pairs.reduce((s, p) => s + p.crop, 0);
    const meanX = sumX / n;
    const meanY = sumY / n;
    const num = pairs.reduce((s, p) => s + (p.diesel - meanX) * (p.crop - meanY), 0);
    const denX = Math.sqrt(pairs.reduce((s, p) => s + (p.diesel - meanX) ** 2, 0));
    const denY = Math.sqrt(pairs.reduce((s, p) => s + (p.crop - meanY) ** 2, 0));
    const corr = denX * denY === 0 ? 0 : num / (denX * denY);
    const r = Math.round(corr * 1000) / 1000;

    let interpretation: string;
    if (Math.abs(r) > 0.7) interpretation = r > 0 ? "Strong positive — diesel rises → crop price rises" : "Strong negative";
    else if (Math.abs(r) > 0.4) interpretation = r > 0 ? "Moderate positive correlation with diesel" : "Moderate negative correlation";
    else interpretation = "Weak correlation with diesel";

    return { crop, correlation: r, interpretation };
  }
}
