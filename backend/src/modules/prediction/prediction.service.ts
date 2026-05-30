import type { Horizon } from "../../models/Prediction.js";
import { PredictionRepository } from "./prediction.repository.js";

export class PredictionService {
  constructor(private readonly repo: PredictionRepository) {}

  async getMultiAlgoForecast(itemName: string, horizon: Horizon) {
    const data = await this.repo.multiAlgoForecast(itemName, horizon);
    const fmt = (pts: Array<{ target_date: Date | undefined; predicted_price: number }>) =>
      pts.map((p) => ({
        target_date: p.target_date ? new Date(p.target_date).toISOString() : null,
        predicted_price: p.predicted_price,
      }));
    return {
      item: itemName,
      horizon,
      random_forest: fmt(data.random_forest ?? []),
      moving_average: fmt(data.moving_average ?? []),
      lstm: fmt(data.lstm ?? []),
    };
  }

  async getForecastSeries(itemName: string, horizon: Horizon) {
    const batchId = await this.repo.latestBatchId(itemName, horizon);
    if (!batchId) return { batch_id: null as string | null, points: [] as unknown[], summary: null as unknown };
    const points = await this.repo.findByBatch(itemName, horizon, batchId);
    const summary = points[points.length - 1] ?? (await this.repo.latestSummaryForItem(itemName, horizon));
    return {
      batch_id: batchId,
      points: points.map((p) => ({
        target_date: p.target_date ? new Date(p.target_date).toISOString() : null,
        predicted_price: p.predicted_price,
        trend: p.trend,
        accuracy: p.accuracy,
        confidence: p.confidence,
        reason: p.reason,
      })),
      summary: summary
        ? {
            trend: summary.trend,
            accuracy: summary.accuracy,
            confidence: summary.confidence,
            reason: summary.reason,
          }
        : null,
    };
  }
}
