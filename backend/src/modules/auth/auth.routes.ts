import { Router } from "express";
import type { Request, Response } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthRepository } from "./auth.repository.js";
import { User } from "../../models/User.js";
import { CropPrice } from "../../models/CropPrice.js";
import { Prediction } from "../../models/Prediction.js";
import { sendSubscriptionWelcomeEmail } from "../../services/email.service.js";
import { SELECTED_CROPS } from "../../config/selectedCrops.js";

const repo = new AuthRepository();
const service = new AuthService(repo);
const controller = new AuthController(service);

export const authRouter = Router();

authRouter.post("/register", controller.register);
authRouter.post("/login", controller.login);
authRouter.get("/me", authMiddleware, controller.me);

authRouter.get("/preferences", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = await User.findOne({ email: req.user!.email }).select("cropPreferences").lean();
  const allowed = new Set([...SELECTED_CROPS]);
  const filtered = (user?.cropPreferences ?? []).filter((c) => allowed.has(c as (typeof SELECTED_CROPS)[number]));
  res.json({ cropPreferences: filtered });
});

authRouter.put("/preferences", authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const { cropPreferences } = req.body as { cropPreferences: unknown };
  if (!Array.isArray(cropPreferences) || cropPreferences.some((x) => typeof x !== "string")) {
    res.status(400).json({ message: "cropPreferences must be a string array" });
    return;
  }
  const allowed = new Set([...SELECTED_CROPS]);
  const filtered = (cropPreferences as string[]).filter((c) => allowed.has(c as (typeof SELECTED_CROPS)[number]));
  await User.findOneAndUpdate({ email: req.user!.email }, { cropPreferences: filtered });
  res.json({ ok: true, cropPreferences: filtered });

  if (filtered.length > 0) {
    const crops = filtered;
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

        const userRole = req.user!.role as "buyer" | "farmer";

        // Email should include both 7-day and 30-day forecast averages.
        // Use the latest random_forest batch per horizon to avoid mixing batches.
        const [latestBatch7, latestBatch30] = await Promise.all([
          Prediction.findOne({ horizon: "7d", algorithm: "random_forest" })
            .sort({ createdAt: -1 })
            .select("forecast_batch_id")
            .lean(),
          Prediction.findOne({ horizon: "30d", algorithm: "random_forest" })
            .sort({ createdAt: -1 })
            .select("forecast_batch_id")
            .lean(),
        ]);

        const forecastPrices7d: Record<string, number[]> = {};
        const forecastPrices30d: Record<string, number[]> = {};

        if (latestBatch7?.forecast_batch_id) {
          const forecastRows7 = await Prediction.find(
            {
              item_name: { $in: crops },
              horizon: "7d",
              algorithm: "random_forest",
              forecast_batch_id: latestBatch7.forecast_batch_id,
            },
            { item_name: 1, predicted_price: 1 }
          ).sort({ target_date: 1 }).lean();

          for (const row of forecastRows7) {
            if (!forecastPrices7d[row.item_name]) forecastPrices7d[row.item_name] = [];
            if (forecastPrices7d[row.item_name].length < 7) forecastPrices7d[row.item_name].push(row.predicted_price);
          }
        }

        if (latestBatch30?.forecast_batch_id) {
          const forecastRows30 = await Prediction.find(
            {
              item_name: { $in: crops },
              horizon: "30d",
              algorithm: "random_forest",
              forecast_batch_id: latestBatch30.forecast_batch_id,
            },
            { item_name: 1, predicted_price: 1 }
          ).sort({ target_date: 1 }).lean();

          for (const row of forecastRows30) {
            if (!forecastPrices30d[row.item_name]) forecastPrices30d[row.item_name] = [];
            if (forecastPrices30d[row.item_name].length < 30) forecastPrices30d[row.item_name].push(row.predicted_price);
          }
        }

        await sendSubscriptionWelcomeEmail({
          toEmail: req.user!.email,
          crops,
          role: userRole,
          todayPrices,
          forecastPrices7d,
          forecastPrices30d,
        });
      } catch (err) {
        console.error("[Email] Welcome email failed:", err instanceof Error ? err.message : err);
      }
    })();
  }
});
