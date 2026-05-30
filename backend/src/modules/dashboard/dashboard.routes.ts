import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";
import { CropRepository } from "../crop/crop.repository.js";
import { WeatherRepository } from "../weather/weather.repository.js";
import { FuelRepository } from "../fuel/fuel.repository.js";
import { PredictionRepository } from "../prediction/prediction.repository.js";

const service = new DashboardService(
  new CropRepository(),
  new WeatherRepository(),
  new FuelRepository(),
  new PredictionRepository()
);
const controller = new DashboardController(service);

export const dashboardRouter = Router();

dashboardRouter.use(authMiddleware);
dashboardRouter.get("/:item", controller.get);
