import axios from "axios";
import { CropPrice } from "../../domain/CropPrice.js";
import { WeatherData } from "../../domain/WeatherData.js";
import { FuelData } from "../../domain/FuelData.js";
import { Prediction } from "../../domain/Prediction.js";

export type Recommendation = "BUY_EARLY_OR_HOLD" | "SELL" | "WAIT";

const KTM_LAT = 27.7172;
const KTM_LON = 85.324;

async function fetchLiveWeather(): Promise<{ date: string; temperature: number; rainfall: number; humidity: number } | null> {
  try {
    const { data } = await axios.get<{
      current?: {
        time?: string;
        temperature_2m?: number;
        precipitation?: number;
        relative_humidity_2m?: number;
      };
    }>("https://api.open-meteo.com/v1/forecast", {
      timeout: 8_000,
      params: {
        latitude: KTM_LAT,
        longitude: KTM_LON,
        current: "temperature_2m,precipitation,relative_humidity_2m",
        timezone: "Asia/Kathmandu",
      },
    });
    const c = data.current;
    if (!c || c.temperature_2m == null) return null;
    return {
      date: c.time ?? new Date().toISOString(),
      temperature: Math.round(c.temperature_2m * 10) / 10,
      rainfall: Math.round((c.precipitation ?? 0) * 100) / 100,
      humidity: Math.round(c.relative_humidity_2m ?? 0),
    };
  } catch {
    return null;
  }
}

export class DashboardService {
  constructor(
    private readonly crops: CropPrice,
    private readonly weather: WeatherData,
    private readonly fuel: FuelData,
    private readonly predictions: Prediction
  ) {}

  async buildDashboard(itemName: string) {
    const started = Date.now();
    const [
      currentDoc,
      liveWeather,
      weatherLatest,
      fuelLatest,
      batch7,
      summary30,
      historical30,
      weather14,
      fuel14,
      weatherMay22Jun2,
      fuelMay22Jun2,
      vegetableAccuracy,
      cropRecordCount,
      predGeneratedAt,
    ] = await Promise.all([
      this.crops.latestForItem(itemName),
      fetchLiveWeather(),
      this.weather.latest(),
      this.fuel.latest(),
      this.predictions.latestBatchId(itemName, "7d").then(async (bid) =>
        bid ? this.predictions.findByBatch(itemName, "7d", bid) : []
      ),
      this.predictions.latestSummaryForItem(itemName, "30d"),
      this.crops.historyForItem(itemName, 30),
      this.weather.findRecent(14),
      this.fuel.findRecent(14),
      this.weather.findWindowLatestYear(5, 22, 6, 2),
      this.fuel.findWindowLatestYear(5, 22, 6, 2),
      this.predictions.latest7dAccuracyByItem(),
      this.crops.countDocuments(),
      this.predictions.latestPredictionGeneratedAt(),
    ]);
    console.log(`[DashboardService] DB+external fanout for ${itemName}: ${Date.now() - started}ms`);

    const hasCurrentRow =
      currentDoc != null &&
      typeof currentDoc.avg_price === "number" &&
      !Number.isNaN(currentDoc.avg_price);
    const currentPrice = hasCurrentRow ? currentDoc.avg_price : null;
    const nextDayPred = batch7.find((p) => p.target_date) ?? batch7[0];
    const predictedPrice = nextDayPred?.predicted_price ?? null;
    const trend30 = summary30?.trend ?? "Stable";

    const recommendation = this.computeRecommendation(currentPrice, predictedPrice, trend30);

    const accuracyRows = await this.buildAccuracyTable(itemName);

    const withAcc = vegetableAccuracy.filter((v) => v.accuracy_pct != null);
    const overallAcc =
      withAcc.length > 0
        ? withAcc.reduce((s, v) => s + (v.accuracy_pct ?? 0), 0) / withAcc.length
        : null;
    const avgPctErr = overallAcc != null ? Math.max(0, 100 - overallAcc) : null;
    const avgPriceErrNpr =
      currentPrice != null && avgPctErr != null ? (avgPctErr / 100) * currentPrice : null;

    const weatherSeries =
      weatherMay22Jun2.length > 0
        ? weatherMay22Jun2
        : weather14.length > 0
          ? weather14
        : liveWeather
          ? [{
              date: new Date(liveWeather.date),
              temperature: liveWeather.temperature,
              rainfall: liveWeather.rainfall,
              humidity: liveWeather.humidity,
            }]
          : weatherLatest
            ? [{
                date: new Date(weatherLatest.date),
                temperature: weatherLatest.temperature,
                rainfall: weatherLatest.rainfall,
                humidity: weatherLatest.humidity,
              }]
            : [];

    const fuelSeries =
      fuelMay22Jun2.length > 0
        ? fuelMay22Jun2
        : fuel14.length > 0
          ? fuel14
        : fuelLatest
          ? [fuelLatest]
          : [];

    const out = {
      item: itemName,
      current_price: hasCurrentRow
        ? {
            avg_price: currentDoc!.avg_price,
            min_price: currentDoc!.min_price,
            max_price: currentDoc!.max_price,
            date: new Date(currentDoc!.date).toISOString(),
          }
        : null,
      weather: liveWeather ?? (weatherLatest
        ? {
            date: new Date(weatherLatest.date).toISOString(),
            temperature: weatherLatest.temperature,
            rainfall: weatherLatest.rainfall,
            humidity: weatherLatest.humidity,
          }
        : null),
      fuel: fuelLatest
        ? {
            date: new Date(fuelLatest.date).toISOString(),
            petrol_price: fuelLatest.petrol_price,
            diesel_price: fuelLatest.diesel_price,
            kerosene_price: fuelLatest.kerosene_price,
            lpg_price: fuelLatest.lpg_price,
          }
        : null,
      recommendation,
      recommendation_detail: {
        logic:
          "If predicted avg price is above current avg → buyers benefit from buying early or holding stock; below → farmers may consider selling; stable short-term → wait.",
      },
      accuracy_table: accuracyRows,
      trend_30d: trend30,
      historical_30d: historical30,
      weather_14d: weatherSeries.map((w) => ({
        date: new Date(w.date).toISOString(),
        temperature: w.temperature,
        rainfall: w.rainfall,
        humidity: w.humidity,
      })),
      fuel_14d: fuelSeries.map((f) => ({
        date: new Date(f.date).toISOString(),
        petrol_price: f.petrol_price,
        diesel_price: f.diesel_price,
        kerosene_price: f.kerosene_price,
        lpg_price: f.lpg_price,
      })),
      vegetable_model_accuracy: vegetableAccuracy,
      accuracy_summary: {
        overall_accuracy_pct: overallAcc != null ? Math.round(overallAcc * 100) / 100 : null,
        avg_pct_error: avgPctErr != null ? Math.round(avgPctErr * 100) / 100 : null,
        avg_price_error_npr: avgPriceErrNpr != null ? Math.round(avgPriceErrNpr * 100) / 100 : null,
        records_used: cropRecordCount,
        computed_at: predGeneratedAt?.toISOString() ?? null,
      },
    };
    console.log(`[DashboardService] Response build for ${itemName}: ${Date.now() - started}ms total`);
    return out;
  }

  private computeRecommendation(
    current: number | null,
    predicted: number | null,
    trend: string
  ): Recommendation {
    if (current != null && predicted != null) {
      const diff = (predicted - current) / Math.max(current, 1e-6);
      if (diff > 0.02) return "BUY_EARLY_OR_HOLD";
      if (diff < -0.02) return "SELL";
    }
    if (trend === "Stable") return "WAIT";
    if (trend === "Increasing") return "BUY_EARLY_OR_HOLD";
    return "SELL";
  }

  private async buildAccuracyTable(itemName: string) {
    const batch7 = await this.predictions.latestBatchId(itemName, "7d");
    const batch30 = await this.predictions.latestBatchId(itemName, "30d");
    const rows: Array<{ item: string; accuracy_pct: number | null; confidence: string; reason: string }> = [];

    if (batch7) {
      const pts = await this.predictions.findByBatch(itemName, "7d", batch7);
      const last = pts[pts.length - 1];
      rows.push({
        item: `${itemName} (7-day horizon)`,
        accuracy_pct: last?.accuracy ?? null,
        confidence: last?.confidence ?? "—",
        reason: last?.reason ?? "Model validation snapshot",
      });
    }
    if (batch30) {
      const pts = await this.predictions.findByBatch(itemName, "30d", batch30);
      const last = pts[pts.length - 1];
      rows.push({
        item: `${itemName} (30-day trend)`,
        accuracy_pct: last?.accuracy ?? null,
        confidence: last?.confidence ?? "—",
        reason: last?.reason ?? "Trend projection",
      });
    }
    if (!rows.length) {
      rows.push({
        item: itemName,
        accuracy_pct: null,
        confidence: "—",
        reason: "Missing data — run daily pipeline after seeding historical prices.",
      });
    }
    return rows;
  }
}
