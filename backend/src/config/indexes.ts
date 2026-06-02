import { KalimatiPrice } from "../models/KalimatiPrice.js";
import { WeatherData } from "../models/WeatherData.js";
import { Prediction } from "../models/Prediction.js";
import { Notification } from "../models/Notification.js";
import { FuelPrice } from "../models/FuelPrice.js";

export async function ensureIndexes(): Promise<void> {
  try {
    await Promise.all([
      KalimatiPrice.syncIndexes(),
      WeatherData.syncIndexes(),
      Prediction.syncIndexes(),
      Notification.syncIndexes(),
      FuelPrice.syncIndexes(),
    ]);
    console.log("[Indexes] All indexes synced.");
  } catch (err) {
    console.warn("[Indexes] Sync warning:", err instanceof Error ? err.message : err);
  }
}
