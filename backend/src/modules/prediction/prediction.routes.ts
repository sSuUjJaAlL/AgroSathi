import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { PredictionController } from "./prediction.controller.js";
import { PredictionService } from "./prediction.service.js";
import { PredictionRepository } from "./prediction.repository.js";

const repo = new PredictionRepository();
const service = new PredictionService(repo);
const controller = new PredictionController(service);

export const predictionRouter = Router();

predictionRouter.use(authMiddleware);
predictionRouter.get("/multi/:item", controller.multiAlgo);
predictionRouter.get("/7days/:item", controller.sevenDays);
predictionRouter.get("/30days/:item", controller.thirtyDays);
