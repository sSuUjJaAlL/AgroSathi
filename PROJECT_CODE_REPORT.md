# AgroPredict Nepal — Source Code Appendix
### Final Year Project — B.Sc. CSIT

---

> **Word formatting tip to keep pages minimal:**
> Select all code sections → Font: **Consolas 8.5pt** → Paragraph: Line spacing **Exactly 10pt**, Space Before/After **0pt** → Margins: **2cm all sides**. This gives ~65 lines per page and keeps the appendix under 55 pages.

---

## System Architecture

```
AgroPredict Nepal
├── frontend/    React + TypeScript + Vite         → Port 5173
├── backend/     Node.js + Express + TypeScript    → Port 4000
├── ml-service/  Python + FastAPI + RandomForest   → Port 8000
└── Database     MongoDB Atlas (Cloud)
```

**Cron Schedule**
| Job | Schedule | Action |
|-----|----------|--------|
| Daily pipeline | 06:05 daily | Scrape prices → sync weather → train RF → notify |
| NOC fuel prices | 07:00 daily | Scrape or fallback NOC fuel prices |
| Weekly retrain | Sunday 02:00 | Full RF + LSTM retrain |
| Buyer digest | Monday 09:00 | Email DROP alerts to buyers |
| Farmer digest | 1st of month 09:00 | Email RISE alerts to farmers |

---

## BACKEND

---

### backend/src/models/User.ts

```typescript
import mongoose, { Schema, type Document } from "mongoose";

export type UserRole = "farmer" | "buyer";

export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  cropPreferences: string[];
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["farmer", "buyer"], required: true },
    cropPreferences: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", UserSchema, "users");
```

---

### backend/src/middleware/auth.middleware.ts

```typescript
import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "../models/User.js";

export interface AuthPayload {
  sub: string;
  email: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request { user?: AuthPayload; }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ message: "Unauthorized" }); return; }
    if (!roles.includes(req.user.role)) { res.status(403).json({ message: "Forbidden" }); return; }
    next();
  };
}
```

---

### backend/src/modules/auth/auth.routes.ts

```typescript
import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthRepository } from "./auth.repository.js";
import { User } from "../../models/User.js";

const repo = new AuthRepository();
const service = new AuthService(repo);
const controller = new AuthController(service);

export const authRouter = Router();

authRouter.post("/register", controller.register);
authRouter.post("/login", controller.login);
authRouter.get("/me", authMiddleware, controller.me);

authRouter.get("/preferences", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = await User.findOne({ email: req.user!.email }).select("cropPreferences").lean();
  res.json({ cropPreferences: user?.cropPreferences ?? [] });
});

authRouter.put("/preferences", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { cropPreferences } = req.body as { cropPreferences: unknown };
  if (!Array.isArray(cropPreferences) || cropPreferences.some((x) => typeof x !== "string")) {
    res.status(400).json({ message: "cropPreferences must be a string array" });
    return;
  }
  await User.findOneAndUpdate({ email: req.user!.email }, { cropPreferences });
  res.json({ ok: true, cropPreferences });
});
```

---

### backend/src/modules/dashboard/dashboard.service.ts

```typescript
import axios from "axios";
import { CropRepository } from "../crop/crop.repository.js";
import { WeatherRepository } from "../weather/weather.repository.js";
import { FuelRepository } from "../fuel/fuel.repository.js";
import { PredictionRepository } from "../prediction/prediction.repository.js";

export type Recommendation = "BUY_EARLY_OR_HOLD" | "SELL" | "WAIT";

const KTM_LAT = 27.7172;
const KTM_LON = 85.324;

async function fetchLiveWeather(): Promise<{ date: string; temperature: number; rainfall: number; humidity: number } | null> {
  try {
    const { data } = await axios.get("https://api.open-meteo.com/v1/forecast", {
      timeout: 8_000,
      params: {
        latitude: KTM_LAT, longitude: KTM_LON,
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
  } catch { return null; }
}

export class DashboardService {
  constructor(
    private readonly crops: CropRepository,
    private readonly weather: WeatherRepository,
    private readonly fuel: FuelRepository,
    private readonly predictions: PredictionRepository
  ) {}

  async buildDashboard(itemName: string) {
    const [
      currentDoc, liveWeather, weatherLatest, fuelLatest,
      batch7, summary30, historical30, weather14, fuel14,
      vegetableAccuracy, cropRecordCount, predGeneratedAt,
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
      this.predictions.latest7dAccuracyByItem(),
      this.crops.countDocuments(),
      this.predictions.latestPredictionGeneratedAt(),
    ]);

    const hasCurrentRow = currentDoc != null && typeof currentDoc.avg_price === "number";
    const currentPrice = hasCurrentRow ? currentDoc.avg_price : null;
    const nextDayPred = batch7.find((p) => p.target_date) ?? batch7[0];
    const predictedPrice = nextDayPred?.predicted_price ?? null;
    const trend30 = summary30?.trend ?? "Stable";
    const recommendation = this.computeRecommendation(currentPrice, predictedPrice, trend30);

    const withAcc = vegetableAccuracy.filter((v) => v.accuracy_pct != null);
    const overallAcc = withAcc.length > 0
      ? withAcc.reduce((s, v) => s + (v.accuracy_pct ?? 0), 0) / withAcc.length : null;
    const avgPctErr = overallAcc != null ? Math.max(0, 100 - overallAcc) : null;
    const avgPriceErrNpr = currentPrice != null && avgPctErr != null
      ? (avgPctErr / 100) * currentPrice : null;

    return {
      item: itemName,
      current_price: hasCurrentRow ? {
        avg_price: currentDoc!.avg_price, min_price: currentDoc!.min_price,
        max_price: currentDoc!.max_price, date: new Date(currentDoc!.date).toISOString(),
      } : null,
      weather: liveWeather ?? (weatherLatest ? {
        date: new Date(weatherLatest.date).toISOString(),
        temperature: weatherLatest.temperature,
        rainfall: weatherLatest.rainfall,
        humidity: weatherLatest.humidity,
      } : null),
      fuel: fuelLatest ? {
        date: new Date(fuelLatest.date).toISOString(),
        petrol_price: fuelLatest.petrol_price,
        diesel_price: fuelLatest.diesel_price,
        kerosene_price: fuelLatest.kerosene_price,
        lpg_price: fuelLatest.lpg_price,
      } : null,
      recommendation,
      recommendation_detail: { logic: "If predicted avg > current → BUY_EARLY_OR_HOLD; below → SELL; stable → WAIT." },
      trend_30d: trend30,
      historical_30d: historical30,
      weather_14d: weather14.map((w) => ({
        date: new Date(w.date).toISOString(),
        temperature: w.temperature, rainfall: w.rainfall, humidity: w.humidity,
      })),
      fuel_14d: fuel14.map((f) => ({
        date: new Date(f.date).toISOString(),
        petrol_price: f.petrol_price, diesel_price: f.diesel_price,
        kerosene_price: f.kerosene_price, lpg_price: f.lpg_price,
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
  }

  private computeRecommendation(current: number | null, predicted: number | null, trend: string): Recommendation {
    if (current != null && predicted != null) {
      const diff = (predicted - current) / Math.max(current, 1e-6);
      if (diff > 0.02) return "BUY_EARLY_OR_HOLD";
      if (diff < -0.02) return "SELL";
    }
    if (trend === "Stable") return "WAIT";
    if (trend === "Increasing") return "BUY_EARLY_OR_HOLD";
    return "SELL";
  }
}
```

---

### backend/src/modules/notifications/notification.service.ts

```typescript
import { Notification } from "../../models/Notification.js";
import { CropPrice } from "../../models/CropPrice.js";
import { Prediction } from "../../models/Prediction.js";
import { User } from "../../models/User.js";
import { sseRegistry } from "./sse.registry.js";
import { sendDigestEmail } from "../../services/email.service.js";
import type { UserRole } from "../../models/User.js";

const PRICE_CHANGE_THRESHOLD_PCT = 2;

async function dedupCheck(commodity: string, direction: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await Notification.findOne({ commodity, direction, createdAt: { $gte: cutoff } }).lean();
  return existing != null;
}

async function getUsersByRole(role: UserRole): Promise<Array<{ email: string; cropPreferences: string[] }>> {
  return User.find({ role }).select("email cropPreferences").lean() as Promise<Array<{ email: string; cropPreferences: string[] }>>;
}

export async function checkAndGenerateNotifications(): Promise<{ created: number; emailsSent: number }> {
  const items = await Prediction.distinct("item_name");
  let created = 0;
  for (const item of items) {
    const currentDoc = await CropPrice.findOne({ item_name: item }).sort({ date: -1 }).lean();
    if (!currentDoc) continue;
    const currentPrice = currentDoc.avg_price;
    const tip7 = await Prediction.findOne({ item_name: item, horizon: "7d" }).sort({ createdAt: -1 }).select("forecast_batch_id").lean();
    if (tip7?.forecast_batch_id) {
      const preds7 = await Prediction.find({ item_name: item, horizon: "7d", forecast_batch_id: tip7.forecast_batch_id }).sort({ target_date: 1 }).lean();
      if (preds7.length > 0) {
        const forecastPrice7 = preds7[preds7.length - 1].predicted_price;
        const pct7 = ((forecastPrice7 - currentPrice) / Math.max(currentPrice, 1e-6)) * 100;
        if (pct7 < -PRICE_CHANGE_THRESHOLD_PCT && !(await dedupCheck(item, "DROP"))) {
          const msg = `${item}: price expected to drop ${Math.abs(pct7).toFixed(1)}% over 7 days (NPR ${forecastPrice7.toFixed(0)} vs current NPR ${currentPrice.toFixed(0)})`;
          const notif = await Notification.create({
            commodity: item, direction: "DROP", horizon: "7d", targetRole: "buyer" as UserRole,
            message: msg, percentChange: Math.round(pct7 * 10) / 10, currentPrice, forecastPrice: forecastPrice7, readBy: [],
          });
          sseRegistry.broadcast("buyer", notif);
          created++;
        }
      }
    }
    const tip30 = await Prediction.findOne({ item_name: item, horizon: "30d" }).sort({ createdAt: -1 }).select("forecast_batch_id").lean();
    if (tip30?.forecast_batch_id) {
      const preds30 = await Prediction.find({ item_name: item, horizon: "30d", forecast_batch_id: tip30.forecast_batch_id }).sort({ target_date: 1 }).lean();
      if (preds30.length > 0) {
        const forecastPrice30 = preds30[preds30.length - 1].predicted_price;
        const pct30 = ((forecastPrice30 - currentPrice) / Math.max(currentPrice, 1e-6)) * 100;
        if (pct30 > PRICE_CHANGE_THRESHOLD_PCT && !(await dedupCheck(item, "RISE"))) {
          const msg = `${item}: price expected to rise ${pct30.toFixed(1)}% over 30 days (NPR ${forecastPrice30.toFixed(0)} vs current NPR ${currentPrice.toFixed(0)})`;
          const notif = await Notification.create({
            commodity: item, direction: "RISE", horizon: "30d", targetRole: "farmer" as UserRole,
            message: msg, percentChange: Math.round(pct30 * 10) / 10, currentPrice, forecastPrice: forecastPrice30, readBy: [],
          });
          sseRegistry.broadcast("farmer", notif);
          created++;
        }
      }
    }
  }
  return { created, emailsSent: 0 };
}

export async function sendBuyerWeeklyDigest(): Promise<{ sent: number }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const notifications = await Notification.find({ targetRole: "buyer", direction: "DROP", createdAt: { $gte: since } })
    .sort({ percentChange: 1 }).lean();
  if (notifications.length === 0) return { sent: 0 };
  const allAlerts = notifications.map((n) => ({
    commodity: n.commodity, direction: n.direction, percentChange: n.percentChange,
    currentPrice: n.currentPrice, forecastPrice: n.forecastPrice, horizon: n.horizon,
  }));
  const buyers = await getUsersByRole("buyer");
  let totalSent = 0;
  for (const buyer of buyers) {
    const prefs = buyer.cropPreferences ?? [];
    const alerts = prefs.length === 0 ? allAlerts
      : allAlerts.filter((a) => prefs.some((p) => a.commodity.toLowerCase().includes(p.toLowerCase())));
    if (alerts.length === 0) continue;
    const result = await sendDigestEmail({ toEmails: [buyer.email], role: "buyer", periodLabel: "Weekly", alerts });
    totalSent += result.sent;
  }
  return { sent: totalSent };
}

export async function sendFarmerMonthlyDigest(): Promise<{ sent: number }> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const notifications = await Notification.find({ targetRole: "farmer", direction: "RISE", createdAt: { $gte: since } })
    .sort({ percentChange: -1 }).lean();
  if (notifications.length === 0) return { sent: 0 };
  const allAlerts = notifications.map((n) => ({
    commodity: n.commodity, direction: n.direction, percentChange: n.percentChange,
    currentPrice: n.currentPrice, forecastPrice: n.forecastPrice, horizon: n.horizon,
  }));
  const farmers = await getUsersByRole("farmer");
  let totalSent = 0;
  for (const farmer of farmers) {
    const prefs = farmer.cropPreferences ?? [];
    const alerts = prefs.length === 0 ? allAlerts
      : allAlerts.filter((a) => prefs.some((p) => a.commodity.toLowerCase().includes(p.toLowerCase())));
    if (alerts.length === 0) continue;
    const result = await sendDigestEmail({ toEmails: [farmer.email], role: "farmer", periodLabel: "Monthly", alerts });
    totalSent += result.sent;
  }
  return { sent: totalSent };
}
```

---

### backend/src/scraper/noc.scraper.ts

```typescript
import axios from "axios";
import * as cheerio from "cheerio";
import type { FuelType } from "../models/FuelPrice.js";

export interface NocFuelRow {
  fuel_type: FuelType;
  price_npr: number;
  source: string;
}

const NOC_URLS = [
  "https://www.noc.org.np/",
  "https://noc.org.np/en/fuel-price",
  "https://noc.org.np/",
];

export async function scrapeNocCurrentPrices(): Promise<NocFuelRow[]> {
  for (const url of NOC_URLS) {
    try {
      const result = await attemptScrape(url);
      if (result.length >= 2) return result;
    } catch { /* try next URL */ }
  }
  return [];
}

async function attemptScrape(url: string): Promise<NocFuelRow[]> {
  try {
    const { data: html } = await axios.get(url, {
      timeout: 15_000,
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0.0.0" },
    });
    const $ = cheerio.load(html);
    const rows: NocFuelRow[] = [];
    $("table tr").each((_i, el) => {
      const cells = $(el).find("td");
      if (cells.length < 2) return;
      const label = $(cells[0]).text().trim().toLowerCase();
      const price = parseFloat($(cells[1]).text().replace(/[^\d.]/g, "").trim());
      if (!price || isNaN(price) || price < 50 || price > 5000) return;
      if (label.includes("petrol")) rows.push({ fuel_type: "petrol", price_npr: price, source: "NOC website" });
      else if (label.includes("diesel")) rows.push({ fuel_type: "diesel", price_npr: price, source: "NOC website" });
      else if (label.includes("kerosene")) rows.push({ fuel_type: "kerosene", price_npr: price, source: "NOC website" });
      else if (label.includes("lpg") || label.includes("gas")) rows.push({ fuel_type: "lpg", price_npr: price, source: "NOC website" });
    });
    if (rows.length >= 2) return rows;
    const pageText = $("body").text();
    const extract = (pattern: RegExp, min: number, max: number): number | null => {
      const m = pageText.match(pattern);
      if (!m) return null;
      const p = parseFloat(m[1]);
      return p >= min && p <= max ? p : null;
    };
    const s2: NocFuelRow[] = [];
    const petrol = extract(/petrol[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 100, 500);
    const diesel = extract(/diesel[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 80, 400);
    const kerosene = extract(/kerosene[^0-9]*?(\d{2,4}(?:\.\d{1,2})?)/i, 80, 400);
    const lpg = extract(/(?:lpg|cooking gas)[^0-9]*?(\d{3,5}(?:\.\d{1,2})?)/i, 500, 5000);
    if (petrol) s2.push({ fuel_type: "petrol", price_npr: petrol, source: "NOC website" });
    if (diesel) s2.push({ fuel_type: "diesel", price_npr: diesel, source: "NOC website" });
    if (kerosene) s2.push({ fuel_type: "kerosene", price_npr: kerosene, source: "NOC website" });
    if (lpg) s2.push({ fuel_type: "lpg", price_npr: lpg, source: "NOC website" });
    return s2;
  } catch (err) {
    console.warn("[NOC scraper] Failed:", err instanceof Error ? err.message : err);
    return [];
  }
}

export function nocFallbackPrices(): NocFuelRow[] {
  return [
    { fuel_type: "petrol",   price_npr: 217,  source: "NOC (Kathmandu, May 2026)" },
    { fuel_type: "diesel",   price_npr: 225,  source: "NOC (Kathmandu, May 2026)" },
    { fuel_type: "kerosene", price_npr: 225,  source: "NOC (Kathmandu, May 2026)" },
    { fuel_type: "lpg",      price_npr: 2160, source: "NOC (Kathmandu, May 2026)" },
  ];
}
```

---

### backend/src/jobs/daily.pipeline.ts

```typescript
import cron from "node-cron";
import axios from "axios";
import { env } from "../config/env.js";
import { scrapeKalimatiPrices } from "../scraper/kalimati.scraper.js";
import { CropRepository } from "../modules/crop/crop.repository.js";
import { FuelRepository } from "../modules/fuel/fuel.repository.js";
import { upsertLatestKalimatiGithubArchive } from "../scripts/importKalimatiGithubArchive.js";
import { syncWeatherForCropDateRange } from "../scripts/syncWeatherOpenMeteo.js";
import { scrapeNocCurrentPrices, nocFallbackPrices } from "../scraper/noc.scraper.js";
import { checkAndGenerateNotifications, sendBuyerWeeklyDigest, sendFarmerMonthlyDigest } from "../modules/notifications/notification.service.js";

function todayUtcDate(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export async function runDailyScrapeJob(): Promise<{ saved: number; message: string }> {
  const { rows, meta } = await scrapeKalimatiPrices();
  const cropRepo = new CropRepository();
  const date = todayUtcDate();
  if (rows.length) {
    const payload = rows.map((r) => ({
      date, item_name: r.item_name, min_price: r.min_price, max_price: r.max_price, avg_price: r.avg_price,
    }));
    const saved = await cropRepo.upsertMany(payload);
    return { saved, message: `Upserted ${saved} crop rows for ${date.toISOString().slice(0, 10)}` };
  }
  const fallback = await upsertLatestKalimatiGithubArchive(14);
  if (fallback) {
    return { saved: fallback.rows, message: `Fallback: ${fallback.rows} rows from GitHub CSV for ${fallback.iso}` };
  }
  return { saved: 0, message: "No crop rows from scrape or fallback." };
}

export async function scrapeNocFuelPrices(): Promise<{ saved: number; message: string }> {
  const fuelRepo = new FuelRepository();
  const today = todayUtcDate();
  let rows = await scrapeNocCurrentPrices();
  if (!rows.length) rows = nocFallbackPrices();
  const saved = await fuelRepo.upsertMany(rows.map((r) => ({ date: today, fuel_type: r.fuel_type, price_npr: r.price_npr, source: r.source })));
  return { saved, message: `NOC fuel: ${saved} rows for ${today.toISOString().slice(0, 10)}` };
}

export async function runMlTrainJob(): Promise<{ ok: boolean; detail?: string }> {
  try {
    await axios.post(`${env.mlServiceUrl.replace(/\/$/, "")}/train`, {}, { timeout: 600_000 });
    return { ok: true, detail: "ML training finished." };
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function runFullDailyPipeline(): Promise<void> {
  const scrape = await runDailyScrapeJob();
  console.log("[Pipeline]", scrape.message);
  try { await syncWeatherForCropDateRange(); } catch (err) { console.warn("[Pipeline] Weather sync failed:", err); }
  const ml = await runMlTrainJob();
  console.log("[Pipeline] ML:", ml);
  try { await checkAndGenerateNotifications(); } catch (err) { console.warn("[Pipeline] Notifications failed:", err); }
}

export function registerCronJobs(): void {
  cron.schedule(env.cronDailyPipeline, () => { void runFullDailyPipeline(); });
  cron.schedule("0 7 * * *", () => { void scrapeNocFuelPrices(); });
  cron.schedule("0 2 * * 0", () => {
    void runMlTrainJob();
    void axios.post(`${env.mlServiceUrl.replace(/\/$/, "")}/train-lstm`, {}, { timeout: 1_200_000 });
  });
  cron.schedule("0 9 * * 1", () => { void sendBuyerWeeklyDigest(); });
  cron.schedule("0 9 1 * *", () => { void sendFarmerMonthlyDigest(); });
}
```

---

## ML SERVICE

---

### ml-service/app/main.py

```python
from __future__ import annotations
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
load_dotenv()
from .training import run_training
from .lstm import run_lstm_training

app = FastAPI(title="Agri Price ML Service", version="2.0.0")

@app.get("/health")
def health():
    return {"status": "ok", "service": "agri-price-ml", "version": "2.0.0"}

@app.post("/train")
def train():
    """Train RandomForest + Moving Average for all crops."""
    try:
        return run_training()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

@app.post("/train-lstm")
def train_lstm():
    """Train LSTM for the 10 featured crops. Takes 5–15 minutes."""
    try:
        return run_lstm_training()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
```

---

### ml-service/app/training.py (key functions)

```python
from __future__ import annotations
import uuid
from datetime import datetime, timedelta
from pathlib import Path
import joblib, numpy as np, pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_percentage_error
from sklearn.preprocessing import LabelEncoder
from .preprocessing import FEATURE_COLUMNS, get_mongo_db, merge_feature_frame

MODEL_PATH = Path(__file__).resolve().parent.parent / "model" / "model.pkl"

def safe_mape(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    mask = np.abs(y_true) > 1e-9
    if mask.sum() == 0:
        return 0.0
    return float(mean_absolute_percentage_error(y_true[mask], y_pred[mask]))

def build_reason(accuracy_pct: float, imputed_cells: int, fuel_std_30: float, rain_std_30: float) -> tuple[str, str]:
    reasons: list[str] = []
    if imputed_cells > 50:
        reasons.append("Missing data imputed for weather/fuel merge")
    if fuel_std_30 > 3:
        reasons.append("Fuel price fluctuation")
    elif fuel_std_30 < 1:
        reasons.append("Stable fuel regime")
    reasons.append("Weather variability" if rain_std_30 > 8 else "Weather consistency")
    confidence = "High" if accuracy_pct >= 85 else "Medium" if accuracy_pct >= 70 else "Low"
    return confidence, "; ".join(reasons[:3])

def recursive_horizon_forecast(
    model: RandomForestRegressor,
    row_template: pd.Series,
    hist_prices: list[float],
    steps: int,
) -> list[float]:
    """Recursively forecast `steps` days by feeding each prediction back as lag features."""
    preds: list[float] = []
    window = hist_prices[-60:] if len(hist_prices) > 60 else hist_prices[:]
    last_row = row_template.copy()
    for _ in range(steps):
        X = np.array([[last_row[c] for c in FEATURE_COLUMNS]])
        p = float(model.predict(X)[0])
        preds.append(max(p, 0.01))
        window.append(p)
        last_row["lag_1_price"]  = window[-2] if len(window) >= 2 else window[-1]
        last_row["lag_7_price"]  = window[-8] if len(window) >= 8 else window[0]
        last_row["lag_14_price"] = window[-15] if len(window) >= 15 else window[0]
        last_row["lag_30_price"] = window[-31] if len(window) >= 31 else window[0]
        last_row["moving_avg_7"]  = float(np.mean(window[-7:]))
        last_row["moving_avg_30"] = float(np.mean(window[-30:])) if len(window) >= 30 else last_row["moving_avg_7"]
        next_day = last_row["date"] + timedelta(days=1)
        last_row["date"] = next_day
        last_row["day"] = next_day.day
        last_row["month"] = next_day.month
    return preds

def moving_average_forecast(hist_prices: list[float], steps: int, window: int = 30) -> list[float]:
    series = hist_prices[-window:] if len(hist_prices) >= window else hist_prices[:]
    base = float(np.mean(series))
    return [round(base, 2)] * steps

def run_training() -> dict:
    merged, full, meta = merge_feature_frame()
    db = get_mongo_db()
    preds_col = db["predictions"]
    batch_id = str(uuid.uuid4())
    trained_items: list[str] = []
    items = merged["item_name"].unique() if not merged.empty else []
    for item in items:
        df = merged[merged["item_name"] == item].copy().sort_values("date")
        if len(df) < 30:
            continue
        le = LabelEncoder()
        df["item_enc"] = le.fit_transform(df["item_name"])
        X = df[FEATURE_COLUMNS].values
        y = df["avg_price"].values
        split = int(len(X) * 0.85)
        X_train, X_test = X[:split], X[split:]
        y_train, y_test = y[:split], y[split:]
        model = RandomForestRegressor(n_estimators=200, max_depth=12, random_state=42, n_jobs=-1)
        model.fit(X_train, y_train)
        mape = safe_mape(y_test, model.predict(X_test)) if len(X_test) > 0 else 0.0
        accuracy_pct = round(max(0.0, (1 - mape) * 100), 2)
        hist_prices = df["avg_price"].tolist()
        template_row = df.iloc[-1].copy()
        rf_7  = recursive_horizon_forecast(model, template_row.copy(), hist_prices, 7)
        rf_30 = recursive_horizon_forecast(model, template_row.copy(), hist_prices, 30)
        ma_7  = moving_average_forecast(hist_prices, 7)
        ma_30 = moving_average_forecast(hist_prices, 30)
        fuel_std_30  = float(df["diesel_price"].tail(30).std()) if "diesel_price" in df.columns else 0.0
        rain_std_30  = float(df["rainfall"].tail(30).std()) if "rainfall" in df.columns else 0.0
        imputed_cells = int(meta.get("imputed_cells", 0))
        confidence, reason = build_reason(accuracy_pct, imputed_cells, fuel_std_30, rain_std_30)
        now = datetime.utcnow()
        for horizon, rf_preds, ma_preds in [("7d", rf_7, ma_7), ("30d", rf_30, ma_30)]:
            steps = len(rf_preds)
            for i, (rf_p, ma_p) in enumerate(zip(rf_preds, ma_preds)):
                target_date = (now + timedelta(days=i + 1)).replace(hour=0, minute=0, second=0, microsecond=0)
                for algo, price in [("random_forest", rf_p), ("moving_average", ma_p)]:
                    preds_col.update_one(
                        {"item_name": item, "horizon": horizon, "algorithm": algo, "target_date": target_date},
                        {"$set": {
                            "predicted_price": price, "accuracy": accuracy_pct,
                            "confidence": confidence, "reason": reason,
                            "forecast_batch_id": batch_id, "generated_at": now,
                            "trend": "Increasing" if price > hist_prices[-1] else "Decreasing",
                        }},
                        upsert=True,
                    )
        joblib.dump(model, MODEL_PATH)
        trained_items.append(item)
    return {"ok": True, "trained": len(trained_items), "items": trained_items, "batch_id": batch_id}
```

---

## FRONTEND

---

### frontend/src/App.tsx

```typescript
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotificationsPage from "./pages/NotificationsPage";
import FuelPricePage from "./pages/FuelPricePage";
import ChartsPage from "./pages/ChartsPage";
import CropPreferencesPage from "./pages/CropPreferencesPage";
import { PipelineProvider, usePipeline } from "./contexts/PipelineContext";
import { PipelineProgressModal } from "./components/agro/PipelineProgressModal";

function PrivateRoute({ children }: { children: React.ReactElement }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function GlobalPipelineSidebar() {
  const { pipeUi, dismissPipeline, toggleMinimize } = usePipeline();
  return (
    <PipelineProgressModal
      open={pipeUi.open}
      minimized={pipeUi.minimized}
      phase={pipeUi.phase}
      commodityLabel={pipeUi.commodity}
      errorMessage={pipeUi.error}
      successMessage={pipeUi.success}
      elapsedSeconds={pipeUi.elapsedTick}
      onDismiss={dismissPipeline}
      onToggleMinimize={toggleMinimize}
    />
  );
}

export default function App() {
  return (
    <PipelineProvider>
      <div className="ambient" aria-hidden />
      <GlobalPipelineSidebar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/notifications" element={<PrivateRoute><NotificationsPage /></PrivateRoute>} />
        <Route path="/fuel-prices" element={<PrivateRoute><FuelPricePage /></PrivateRoute>} />
        <Route path="/charts" element={<PrivateRoute><ChartsPage /></PrivateRoute>} />
        <Route path="/crop-preferences" element={<PrivateRoute><CropPreferencesPage /></PrivateRoute>} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </PipelineProvider>
  );
}
```

---

### frontend/src/contexts/PipelineContext.tsx

```typescript
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchSevenDay, runPipeline } from "../services/api";
import type { PipelineModalPhase } from "../components/agro/PipelineProgressModal";

interface PipelineState {
  open: boolean; minimized: boolean; phase: PipelineModalPhase;
  commodity: string; error?: string | null; success?: string | null;
  elapsedTick: number; refreshTick: number;
}

interface PipelineCtxValue {
  pipeUi: PipelineState; pipelineBusy: boolean;
  startPipeline: (item: string, prevBatchId: string | null) => void;
  dismissPipeline: () => void; toggleMinimize: () => void;
}

const PipelineCtx = createContext<PipelineCtxValue | null>(null);
const IDLE: PipelineState = { open: false, minimized: false, phase: "idle", commodity: "", elapsedTick: 0, refreshTick: 0 };

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [pipeUi, setPipeUi] = useState<PipelineState>(IDLE);
  const runningRef = useRef(false);
  const pipelineBusy = pipeUi.open && pipeUi.phase !== "success" && pipeUi.phase !== "error";

  useEffect(() => {
    const active = pipeUi.open && ["starting", "preprocess", "analyze", "finalize"].includes(pipeUi.phase);
    if (!active) return;
    const id = window.setInterval(() => setPipeUi((u) => ({ ...u, elapsedTick: u.elapsedTick + 1 })), 1000);
    return () => window.clearInterval(id);
  }, [pipeUi.open, pipeUi.phase]);

  const dismissPipeline = useCallback(() => {
    setPipeUi((u) => ({ ...IDLE, refreshTick: u.refreshTick }));
    runningRef.current = false;
  }, []);

  const toggleMinimize = useCallback(() => {
    setPipeUi((u) => ({ ...u, minimized: !u.minimized }));
  }, []);

  const startPipeline = useCallback(async (item: string, prevBatchId: string | null) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPipeUi((u) => ({ ...IDLE, open: true, phase: "starting", commodity: item, refreshTick: u.refreshTick }));
    try {
      await runPipeline();
    } catch (e) {
      setPipeUi((u) => ({ ...u, phase: "error", error: e instanceof Error ? e.message : "Pipeline failed." }));
      runningRef.current = false;
      return;
    }
    const start = Date.now();
    const maxMs = 6 * 60 * 1000;
    const inferPhase = (elapsed: number): PipelineModalPhase =>
      elapsed < 8000 ? "preprocess" : elapsed < 90000 ? "analyze" : "finalize";
    setPipeUi((u) => ({ ...u, phase: "preprocess" }));
    while (runningRef.current && Date.now() - start < maxMs) {
      setPipeUi((u) => ({ ...u, phase: inferPhase(Date.now() - start) }));
      try {
        const seven = await fetchSevenDay(item).catch(() => null);
        const points = seven?.points?.length ?? 0;
        const newBatch = seven?.batch_id ?? null;
        const ready = points > 0 && (prevBatchId === null || (newBatch != null && newBatch !== prevBatchId));
        if (ready) {
          const avg = seven!.points!.reduce((s, p) => s + p.predicted_price, 0) / points;
          setPipeUi((u) => ({
            ...u, phase: "success", minimized: false,
            success: `Forecasts updated for "${item}". Avg 7 days: Rs. ${avg.toFixed(2)}/kg.`,
            refreshTick: u.refreshTick + 1,
          }));
          runningRef.current = false;
          return;
        }
      } catch { /* continue polling */ }
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (runningRef.current) {
      setPipeUi((u) => ({ ...u, phase: "error", error: "No forecast within 6 minutes. Check backend logs." }));
    }
    runningRef.current = false;
  }, []);

  return (
    <PipelineCtx.Provider value={{ pipeUi, pipelineBusy, startPipeline, dismissPipeline, toggleMinimize }}>
      {children}
    </PipelineCtx.Provider>
  );
}

export function usePipeline(): PipelineCtxValue {
  const ctx = useContext(PipelineCtx);
  if (!ctx) throw new Error("usePipeline must be within PipelineProvider");
  return ctx;
}
```

---

### frontend/src/pages/Dashboard.tsx

```typescript
import { useEffect, useState } from "react";
import { Bell, ChartLine, Coins, Fuel, Lightbulb, LineChart as LineChartIcon, Play, Search, TrendingDown, TrendingUp } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { AgroHeader } from "../components/agro/AgroHeader";
import { ModelAccuracySection } from "../components/agro/ModelAccuracySection";
import { fetchDashboard, fetchFeaturedCrops, fetchSevenDay, fetchThirtyDay, type DashboardPayload, type ForecastPayload, type Role } from "../services/api";
import { DecisionSupportPanel } from "../components/DecisionSupportPanel";
import { useNavigate } from "react-router-dom";
import { usePipeline } from "../contexts/PipelineContext";

function recommendationUi(code: DashboardPayload["recommendation"]) {
  switch (code) {
    case "BUY_EARLY_OR_HOLD": return { text: "HOLD / BUY EARLY", className: "agro-rec-buy" };
    case "SELL":               return { text: "SELL / REDUCE",    className: "agro-rec-sell" };
    default:                   return { text: "WAIT",             className: "agro-rec-wait" };
  }
}

export default function Dashboard() {
  const { logout, role, email } = useAuth();
  const navigate = useNavigate();
  const { pipelineBusy, startPipeline, pipeUi } = usePipeline();
  const [viewRole, setViewRole] = useState<Role>(() => role ?? "buyer");
  const [items, setItems] = useState<string[]>([]);
  const [item, setItem] = useState("");
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [f7, setF7] = useState<ForecastPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (role) setViewRole(role); }, [role]);

  useEffect(() => {
    void fetchFeaturedCrops()
      .then((r) => { setItems(r.items); setItem((prev) => (prev && r.items.includes(prev) ? prev : r.items[0] ?? "")); })
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!item) return;
    setErr(null);
    void Promise.all([fetchDashboard(item), fetchSevenDay(item).catch(() => null), fetchThirtyDay(item).catch(() => null)])
      .then(([d, seven]) => { setDash(d as DashboardPayload); setF7(seven as ForecastPayload | null); })
      .catch((e: Error) => setErr(e.message));
  }, [item, pipeUi.refreshTick]);

  const avgPred7 = (f7?.points?.length ?? 0) > 0
    ? f7!.points.reduce((s, p) => s + p.predicted_price, 0) / f7!.points.length : null;
  const trendLabel = dash?.trend_30d || "—";
  const trendUp = trendLabel.toLowerCase().includes("increase");
  const rec = dash ? recommendationUi(dash.recommendation) : null;

  return (
    <div className="agro-app">
      <AgroHeader lastUpdatedIso={dash?.current_price?.date ?? null} viewRole={viewRole} onRoleChange={setViewRole} onLogout={logout} />
      <main className="agro-main">
        <div className="agro-controls card-agro">
          <div className="agro-select-block">
            <label className="agro-select-label"><Search size={16} aria-hidden /> Select Commodity</label>
            <select className="agro-select" value={item} onChange={(e) => setItem(e.target.value)}>
              {items.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="agro-nav-btns">
            <button type="button" className="agro-nav-btn" onClick={() => navigate(`/charts?item=${encodeURIComponent(item)}`)}>
              <LineChartIcon size={15} aria-hidden /> View Charts
            </button>
            <button type="button" className="agro-nav-btn" onClick={() => navigate("/crop-preferences")}>
              <Bell size={15} aria-hidden /> Crop Alerts
            </button>
          </div>
          <div className="agro-pipeline-block">
            <div className="agro-pipeline-cap">Data Pipeline</div>
            <button type="button" className="agro-btn-pipeline" disabled={pipelineBusy}
              onClick={() => startPipeline(item, f7?.batch_id ?? null)}>
              <Play size={18} fill="currentColor" aria-hidden />
              {pipelineBusy ? "Running…" : "Run Pipeline"}
            </button>
          </div>
          <div className="agro-user-mini">
            <span className="muted-agro">{email}</span>
            <button type="button" className="agro-btn-ghost" onClick={logout}>Logout</button>
          </div>
        </div>

        {err && <div className="agro-banner agro-banner-err" role="alert">{err}</div>}

        <div className="agro-metrics">
          <div className="agro-metric-card">
            <div className="agro-metric-ico agro-ico-green"><Coins size={22} /></div>
            <div className="agro-metric-body">
              <div className="agro-metric-label">Current Price</div>
              <div className="agro-metric-val">Rs. {dash?.current_price?.avg_price.toFixed(2) ?? "—"}</div>
              <div className="agro-metric-unit">NPR / KG</div>
            </div>
          </div>
          <div className="agro-metric-card">
            <div className="agro-metric-ico agro-ico-blue"><ChartLine size={22} /></div>
            <div className="agro-metric-body">
              <div className="agro-metric-label">Avg Predicted (7d)</div>
              <div className="agro-metric-val">{avgPred7 != null ? `Rs. ${avgPred7.toFixed(2)}` : "—"}</div>
              <div className="agro-metric-unit">NPR / KG</div>
            </div>
          </div>
          <div className="agro-metric-card">
            <div className={`agro-metric-ico ${trendUp ? "agro-ico-red" : "agro-ico-muted"}`}>
              {trendUp ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
            </div>
            <div className="agro-metric-body">
              <div className="agro-metric-label">Price Trend</div>
              <div className={`agro-metric-trend ${trendUp ? "up" : ""}`}>{trendLabel}</div>
            </div>
          </div>
          <div className="agro-metric-card">
            <div className="agro-metric-ico agro-ico-amber"><Lightbulb size={22} /></div>
            <div className="agro-metric-body">
              <div className="agro-metric-label">Recommendation</div>
              {rec && <span className={`agro-rec-pill ${rec.className}`}>{rec.text}</span>}
            </div>
          </div>
        </div>

        {dash && (
          <div className="agro-two-col">
            <div className="agro-col-left">
              <DecisionSupportPanel dash={dash} role={viewRole} dieselChangePct={null} />
              <div style={{ marginTop: "1.25rem" }}>
                <ModelAccuracySection
                  vegetable_model_accuracy={dash.vegetable_model_accuracy ?? []}
                  accuracy_summary={dash.accuracy_summary ?? { overall_accuracy_pct: null, avg_pct_error: null, avg_price_error_npr: null, records_used: 0, computed_at: null }}
                />
              </div>
            </div>
            <aside className="agro-sidebar">
              <div className="agro-card agro-mini-card">
                <h3 className="agro-mini-title">
                  <span className="agro-mini-ico">🌡️</span> Weather — Kathmandu
                  <span className="agro-live-badge">Live</span>
                </h3>
                {dash.weather ? (
                  <div className="agro-weather-grid">
                    <div className="agro-wx agro-wx-temp"><span className="agro-wx-label">Temperature</span><strong>{dash.weather.temperature.toFixed(1)} °C</strong></div>
                    <div className="agro-wx agro-wx-rain"><span className="agro-wx-label">Precipitation</span><strong>{dash.weather.rainfall.toFixed(2)} mm</strong></div>
                    <div className="agro-wx agro-wx-hum"><span className="agro-wx-label">Humidity</span><strong>{dash.weather.humidity.toFixed(0)} %</strong></div>
                  </div>
                ) : <p className="muted-agro">No weather data.</p>}
              </div>
              <div className="agro-card agro-mini-card">
                <h3 className="agro-mini-title"><Fuel size={18} strokeWidth={2} /> NOC Fuel Prices</h3>
                {dash.fuel ? (
                  <div className="agro-fuel-row">
                    <div className="agro-fuel-pill petrol"><span>Petrol</span><strong>Rs. {dash.fuel.petrol_price.toFixed(0)}</strong></div>
                    <div className="agro-fuel-pill diesel"><span>Diesel</span><strong>Rs. {dash.fuel.diesel_price.toFixed(0)}</strong></div>
                    {dash.fuel.kerosene_price != null && (
                      <div className="agro-fuel-pill" style={{ background: "#dbeafe", color: "#1e40af" }}>
                        <span>Kerosene</span><strong>Rs. {dash.fuel.kerosene_price.toFixed(0)}</strong>
                      </div>
                    )}
                    {dash.fuel.lpg_price != null && (
                      <div className="agro-fuel-pill" style={{ background: "#ede9fe", color: "#5b21b6" }}>
                        <span>LPG/cyl</span><strong>Rs. {dash.fuel.lpg_price.toFixed(0)}</strong>
                      </div>
                    )}
                  </div>
                ) : <p className="muted-agro">No fuel data — run pipeline to refresh.</p>}
              </div>
            </aside>
          </div>
        )}
      </main>
      <footer className="agro-footer">
        AgroPredict Nepal | Agricultural Price Prediction System | Final Year CSIT Project
      </footer>
    </div>
  );
}
```

---

### frontend/src/services/api.ts (key functions)

```typescript
const TOKEN_KEY = "agri_jwt";
export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null): void =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as Record<string, string> || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try { res = await fetch(path, { ...init, headers }); }
  catch { throw new Error("Network error — check that the backend is running (port 4000)."); }
  const text = await res.text();
  if (!res.ok) throw new Error(text || `Request failed (${res.status})`);
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export type Role = "farmer" | "buyer";
export const login = (email: string, password: string) =>
  request<{ token: string; user: { email: string; role: Role } }>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const register = (email: string, password: string, role: Role) =>
  request<{ token: string; user: { email: string; role: Role } }>("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, role }) });
export const fetchMe = () => request<{ email: string; role: Role }>("/api/auth/me");
export const getCropPreferences = () => request<{ cropPreferences: string[] }>("/api/auth/preferences");
export const setCropPreferences = (cropPreferences: string[]) =>
  request<{ ok: boolean; cropPreferences: string[] }>("/api/auth/preferences", { method: "PUT", body: JSON.stringify({ cropPreferences }) });
export const fetchFeaturedCrops = () => request<{ items: string[] }>("/api/crop/featured");
export const fetchDashboard = (item: string) => request<DashboardPayload>(`/api/dashboard/${encodeURIComponent(item)}`);
export const fetchSevenDay = (item: string) => request<ForecastPayload>(`/api/predict/7days/${encodeURIComponent(item)}`);
export const fetchThirtyDay = (item: string) => request<ForecastPayload>(`/api/predict/30days/${encodeURIComponent(item)}`);
export const runPipeline = () => request<{ ok: boolean; message: string }>("/api/pipeline/run", { method: "POST", body: "{}" });
export const fetchNotifications = (page = 1, limit = 20) =>
  request<{ notifications: AppNotification[]; total: number; page: number; pages: number }>(
    `/api/notifications?page=${page}&limit=${limit}`
  );
export const fetchUnreadCount = () => request<{ count: number }>("/api/notifications/unread-count");
export const markNotificationRead = (id: string) => request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "PATCH" });
export const markAllNotificationsRead = () => request<{ ok: boolean }>("/api/notifications/read-all", { method: "PATCH" });
export const fetchMultiAlgoForecast = (item: string, horizon: "7d" | "30d" = "7d") =>
  request<{ item: string; horizon: string; random_forest: PredPoint[]; moving_average: PredPoint[]; lstm: PredPoint[] }>(
    `/api/predict/multi/${encodeURIComponent(item)}?horizon=${horizon}`
  );
```

---

*End of Source Code Appendix*
