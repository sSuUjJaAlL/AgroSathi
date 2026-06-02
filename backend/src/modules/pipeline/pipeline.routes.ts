import { Router } from "express";
import mongoose from "mongoose";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { runFullDailyPipeline, runLstmTrainJob, scrapeNocFuelPrices } from "../../jobs/daily.pipeline.js";
import { env } from "../../config/env.js";
import axios from "axios";

export const pipelineRouter = Router();

pipelineRouter.use(authMiddleware);

pipelineRouter.post("/run", (_req, res) => {
  void runFullDailyPipeline().catch((err) => console.error("[API pipeline/run]", err));
  res.status(202).json({
    ok: true,
    message: "Pipeline started in background (scrape → weather sync → ML train). Refresh the dashboard shortly.",
  });
});

pipelineRouter.post("/train-lstm", (_req, res) => {
  void runLstmTrainJob().catch((err) => console.error("[API train-lstm]", err));
  res.status(202).json({
    ok: true,
    message: "LSTM training started (8 Kalimati commodities, 30-day window). Takes ~5–15 min.",
  });
});

pipelineRouter.post("/fuel-sync", (_req, res) => {
  void scrapeNocFuelPrices().catch((err) => console.error("[API fuel-sync]", err));
  res.status(202).json({ ok: true, message: "NOC fuel price sync started." });
});

pipelineRouter.post("/debug/retrain", async (_req, res) => {
  try {
    const db = mongoose.connection.db;
    if (!db) {
      res.status(503).json({ ok: false, message: "Database not connected." });
      return;
    }
    const [cropRows, fuelRows, weatherRows] = await Promise.all([
      db.collection("kalimati_prices").countDocuments({}),
      db.collection("fuel_prices").countDocuments({ fuel_type: "diesel" }),
      db.collection("weather_data").countDocuments({}),
    ]);

    const mlUrl = `${env.mlServiceUrl.replace(/\/$/, "")}/train`;
    const train = await axios.post(mlUrl, { force: true }, { timeout: 600_000 });

    const forecastsGenerated = await db.collection("predictions").countDocuments({
      algorithm: "random_forest",
      date: { $gte: new Date(Date.now() - 60 * 60 * 1000) },
    });

    res.json({
      ok: true,
      cropRows,
      fuelRows,
      weatherRows,
      mergedRows: train.data?.item_count ?? null,
      modelTrained: !train.data?.skipped,
      forecastsGenerated,
      trainResult: train.data,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
