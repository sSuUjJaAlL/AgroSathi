import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { runFullDailyPipeline, runLstmTrainJob, scrapeNocFuelPrices } from "../../jobs/daily.pipeline.js";

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
    message: "LSTM training started (10 featured crops, 30-day window). Takes ~5–15 min.",
  });
});

pipelineRouter.post("/fuel-sync", (_req, res) => {
  void scrapeNocFuelPrices().catch((err) => console.error("[API fuel-sync]", err));
  res.status(202).json({ ok: true, message: "NOC fuel price sync started." });
});
