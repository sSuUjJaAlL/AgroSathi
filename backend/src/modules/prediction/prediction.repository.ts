import { Prediction, type Horizon, type Algorithm } from "../../models/Prediction.js";

export class PredictionRepository {
  async latestBatchId(itemName: string, horizon: Horizon): Promise<string | null> {
    const doc = await Prediction.findOne({ item_name: itemName, horizon })
      .sort({ createdAt: -1 })
      .select("forecast_batch_id")
      .lean();
    return doc?.forecast_batch_id ?? null;
  }

  async findByBatch(itemName: string, horizon: Horizon, batchId: string) {
    return Prediction.find({ item_name: itemName, horizon, forecast_batch_id: batchId })
      .sort({ target_date: 1 })
      .lean();
  }

  async latestSummaryForItem(itemName: string, horizon: Horizon) {
    return Prediction.findOne({ item_name: itemName, horizon })
      .sort({ createdAt: -1 })
      .lean();
  }

  /** One row per vegetable from the latest 7-day forecast batch (validation accuracy per item). */
  async latest7dAccuracyByItem(): Promise<
    Array<{ item: string; accuracy_pct: number | null; confidence: string; reason: string }>
  > {
    const tip = await Prediction.findOne({ horizon: "7d" }).sort({ date: -1 }).select("forecast_batch_id").lean();
    const bid = tip?.forecast_batch_id;
    if (!bid) return [];
    const docs = await Prediction.find({ horizon: "7d", forecast_batch_id: bid }).sort({ item_name: 1 }).lean();
    const seen = new Set<string>();
    const out: Array<{ item: string; accuracy_pct: number | null; confidence: string; reason: string }> = [];
    for (const d of docs) {
      if (seen.has(d.item_name)) continue;
      seen.add(d.item_name);
      out.push({
        item: d.item_name,
        accuracy_pct: typeof d.accuracy === "number" ? d.accuracy : null,
        confidence: d.confidence ?? "—",
        reason: d.reason ?? "",
      });
    }
    return out.sort((a, b) => (b.accuracy_pct ?? 0) - (a.accuracy_pct ?? 0));
  }

  async latestPredictionGeneratedAt(): Promise<Date | null> {
    const d = await Prediction.findOne({ horizon: "7d" }).sort({ date: -1 }).select("date").lean();
    return d?.date ? new Date(d.date) : null;
  }

  async latestBatchIdByAlgo(itemName: string, horizon: Horizon, algorithm: Algorithm): Promise<string | null> {
    const doc = await Prediction.findOne({ item_name: itemName, horizon, algorithm })
      .sort({ createdAt: -1 })
      .select("forecast_batch_id")
      .lean();
    return doc?.forecast_batch_id ?? null;
  }

  async findByBatchAndAlgo(itemName: string, horizon: Horizon, batchId: string, algorithm: Algorithm) {
    return Prediction.find({ item_name: itemName, horizon, forecast_batch_id: batchId, algorithm })
      .sort({ target_date: 1 })
      .lean();
  }

  /** Latest predictions for all 3 algorithms for a given item+horizon. */
  async multiAlgoForecast(itemName: string, horizon: Horizon): Promise<Record<string, Array<{ target_date: Date | undefined; predicted_price: number }>>> {
    const algos: Algorithm[] = ["random_forest", "moving_average", "lstm"];
    const result: Record<string, Array<{ target_date: Date | undefined; predicted_price: number }>> = {};
    await Promise.all(
      algos.map(async (algo) => {
        const batchId = await this.latestBatchIdByAlgo(itemName, horizon, algo);
        if (!batchId) {
          result[algo] = [];
          return;
        }
        const docs = await this.findByBatchAndAlgo(itemName, horizon, batchId, algo);
        result[algo] = docs.map((d) => ({
          target_date: d.target_date,
          predicted_price: d.predicted_price,
        }));
      })
    );
    return result;
  }
}
