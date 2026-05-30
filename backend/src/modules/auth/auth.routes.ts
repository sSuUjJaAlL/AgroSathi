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
