import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { FuelController } from "./fuel.controller.js";
import { FuelService } from "./fuel.service.js";
import { FuelRepository } from "./fuel.repository.js";

const repo = new FuelRepository();
const service = new FuelService(repo);
const controller = new FuelController(service);

export const fuelRouter = Router();

fuelRouter.use(authMiddleware);
fuelRouter.get("/", controller.list);
fuelRouter.get("/latest", controller.latest);
fuelRouter.get("/snapshot", controller.latestSnapshot);
fuelRouter.get("/impact/:crop", controller.impact);
