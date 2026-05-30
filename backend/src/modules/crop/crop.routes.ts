import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { CropController } from "./crop.controller.js";
import { CropService } from "./crop.service.js";
import { CropRepository } from "./crop.repository.js";

const repo = new CropRepository();
const service = new CropService(repo);
const controller = new CropController(service);

export const cropRouter = Router();

cropRouter.use(authMiddleware);
cropRouter.get("/featured", controller.listFeatured);
cropRouter.get("/items/top", controller.listTopItems);
cropRouter.get("/items", controller.listItems);
cropRouter.get("/snapshot", controller.snapshot);
cropRouter.get("/current/:item", controller.currentItem);
