import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthRepository } from "./auth.repository.js";
import { User } from "../../models/User.js";
import { CropPrice } from "../../models/CropPrice.js";
import { sendSubscriptionWelcomeEmail } from "../../services/email.service.js";

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

  if ((cropPreferences as string[]).length > 0) {
    const crops = cropPreferences as string[];
    void (async () => {
      try {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        const recent = await CropPrice.find(
          { item_name: { $in: crops }, date: { $gte: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000) } },
          { item_name: 1, avg_price: 1, date: 1 }
        ).sort({ date: -1 }).lean();

        const todayPrices: Record<string, number> = {};
        for (const row of recent) {
          if (!(row.item_name in todayPrices)) {
            todayPrices[row.item_name] = row.avg_price;
          }
        }

        await sendSubscriptionWelcomeEmail({
          toEmail: req.user!.email,
          crops,
          role: req.user!.role as "buyer" | "farmer",
          todayPrices,
        });
      } catch (err) {
        console.error("[Email] Welcome email failed:", err instanceof Error ? err.message : err);
      }
    })();
  }
});
