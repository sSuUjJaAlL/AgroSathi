import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { CropPrice } from "../../domain/CropPrice.js";
import { WeatherData } from "../../domain/WeatherData.js";
import { FuelData } from "../../domain/FuelData.js";
import { Prediction } from "../../domain/Prediction.js";

const service = new DashboardService(
  new CropPrice(),
  new WeatherData(),
  new FuelData(),
  new Prediction()
);
const controller = new DashboardController(service);

export const dashboardRouter = Router();

dashboardRouter.use(authMiddleware);
dashboardRouter.get("/:item", controller.get);
