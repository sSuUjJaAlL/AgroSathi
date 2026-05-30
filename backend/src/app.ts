import express from "express";
import mongoose from "mongoose";
import "express-async-errors";
import cors from "cors";
import { startMongoConnectionLoop } from "./config/database.js";
import { ensureIndexes } from "./config/indexes.js";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { registerCronJobs } from "./jobs/daily.pipeline.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { weatherRouter } from "./modules/weather/weather.routes.js";
import { fuelRouter } from "./modules/fuel/fuel.routes.js";
import { cropRouter } from "./modules/crop/crop.routes.js";
import { predictionRouter } from "./modules/prediction/prediction.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { pipelineRouter } from "./modules/pipeline/pipeline.routes.js";
import { notificationRouter } from "./modules/notifications/notification.routes.js";
import { verifySmtp } from "./services/email.service.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => {
  const db =
    mongoose.connection.readyState === 1 ? "connected" : mongoose.connection.readyState === 2 ? "connecting" : "disconnected";
  res.json({ status: "ok", service: "agri-price-backend", database: db });
});

/** Sign-up / API calls get a clear JSON error while Mongo or Docker is still starting */
app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  if (mongoose.connection.readyState === 1) return next();
  res.status(503).json({
    message:
      "Database is not ready. Check MONGODB_URI in backend/.env (Atlas URI or local Docker), then retry.",
  });
});

app.use("/api/auth", authRouter);
app.use("/api/data/weather", weatherRouter);
app.use("/api/data/fuel", fuelRouter);
app.use("/api/crop", cropRouter);
app.use("/api/predict", predictionRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/pipeline", pipelineRouter);
app.use("/api/notifications", notificationRouter);

app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`Backend listening on http://localhost:${env.port}`);
  console.log("Connecting to MongoDB (retries in background). Check MONGODB_URI in .env.");
  void verifySmtp();
  startMongoConnectionLoop(() => {
    void ensureIndexes();
    registerCronJobs();
  });
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${env.port} is already in use. Stop the other backend (lsof -i :${env.port}) or set PORT in .env`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
