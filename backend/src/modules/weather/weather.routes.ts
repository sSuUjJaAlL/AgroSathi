import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { WeatherController } from "./weather.controller.js";
import { WeatherService } from "./weather.service.js";
import { WeatherRepository } from "./weather.repository.js";

const repo = new WeatherRepository();
const service = new WeatherService(repo);
const controller = new WeatherController(service);

export const weatherRouter = Router();

weatherRouter.use(authMiddleware);
weatherRouter.get("/", controller.list);
