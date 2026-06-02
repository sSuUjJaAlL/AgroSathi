import { Notification } from "../../models/Notification.js";
import { KalimatiPrice } from "../../models/KalimatiPrice.js";
import { SELECTED_CROPS } from "../../config/selectedCrops.js";
import { Prediction } from "../../models/Prediction.js";
import { User } from "../../models/User.js";
import { sseRegistry } from "./sse.registry.js";
import { sendDigestEmail } from "../../services/email.service.js";
import type { UserRole } from "../../models/User.js";

const PRICE_CHANGE_THRESHOLD_PCT = 2;

async function dedupCheck(commodity: string, direction: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const existing = await Notification.findOne({ commodity, direction, createdAt: { $gte: cutoff } }).lean();
  return existing != null;
}

async function latestBatchPredictions(itemName: string, horizon: "7d" | "30d") {
  const tip = await Prediction.findOne({ item_name: itemName, horizon })
    .sort({ createdAt: -1 })
    .select("forecast_batch_id")
    .lean();
  if (!tip?.forecast_batch_id) return [];
  return Prediction.find({ item_name: itemName, horizon, forecast_batch_id: tip.forecast_batch_id })
    .sort({ target_date: 1 })
    .lean();
}

async function getUsersByRole(role: UserRole): Promise<Array<{ email: string; cropPreferences: string[] }>> {
  return User.find({ role }).select("email cropPreferences").lean() as Promise<Array<{ email: string; cropPreferences: string[] }>>;
}

export async function checkAndGenerateNotifications(): Promise<{ created: number; emailsSent: number }> {
  let created = 0;
  let emailsSent = 0;

  for (const item of SELECTED_CROPS) {
    const currentDoc = await KalimatiPrice.findOne({ commodityEnglish: item })
      .sort({ date: -1 })
      .lean();
    if (!currentDoc) continue;
    const currentPrice = currentDoc.averagePrice;

    // 7-day forecast drop → notify buyers
    const preds7 = await latestBatchPredictions(item, "7d");
    if (preds7.length > 0) {
      const forecastPrice7 = preds7[preds7.length - 1].predicted_price;
      const pct7 = ((forecastPrice7 - currentPrice) / Math.max(currentPrice, 1e-6)) * 100;

      if (pct7 < -PRICE_CHANGE_THRESHOLD_PCT) {
        const alreadySent = await dedupCheck(item, "DROP");
        if (!alreadySent) {
          const msg = `${item}: price expected to drop ${Math.abs(pct7).toFixed(1)}% over 7 days (NPR ${forecastPrice7.toFixed(0)} vs current NPR ${currentPrice.toFixed(0)})`;
          const notif = await Notification.create({
            commodity: item,
            direction: "DROP",
            horizon: "7d",
            targetRole: "buyer" as UserRole,
            message: msg,
            percentChange: Math.round(pct7 * 10) / 10,
            currentPrice,
            forecastPrice: forecastPrice7,
            readBy: [],
          });
          sseRegistry.broadcast("buyer", notif);
          created++;
        }
      }
    }

    // 30-day forecast rise → notify farmers
    const preds30 = await latestBatchPredictions(item, "30d");
    if (preds30.length > 0) {
      const forecastPrice30 = preds30[preds30.length - 1].predicted_price;
      const pct30 = ((forecastPrice30 - currentPrice) / Math.max(currentPrice, 1e-6)) * 100;

      if (pct30 > PRICE_CHANGE_THRESHOLD_PCT) {
        const alreadySent = await dedupCheck(item, "RISE");
        if (!alreadySent) {
          const msg = `${item}: price expected to rise ${pct30.toFixed(1)}% over 30 days (NPR ${forecastPrice30.toFixed(0)} vs current NPR ${currentPrice.toFixed(0)})`;
          const notif = await Notification.create({
            commodity: item,
            direction: "RISE",
            horizon: "30d",
            targetRole: "farmer" as UserRole,
            message: msg,
            percentChange: Math.round(pct30 * 10) / 10,
            currentPrice,
            forecastPrice: forecastPrice30,
            readBy: [],
          });
          sseRegistry.broadcast("farmer", notif);
          created++;
        }
      }
    }
  }

  console.log(`[Notifications] Created ${created} notification(s) across ${SELECTED_CROPS.length} commodities.`);
  return { created, emailsSent: 0 };
}

export async function sendBuyerWeeklyDigest(): Promise<{ sent: number }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const notifications = await Notification.find({
    targetRole: "buyer",
    direction: "DROP",
    createdAt: { $gte: since },
  })
    .sort({ percentChange: 1 })
    .lean();

  if (notifications.length === 0) {
    console.log("[Email] Buyer weekly digest: no DROP alerts in past 7 days — skipping");
    return { sent: 0 };
  }

  const allAlerts = notifications.map((n) => ({
    commodity: n.commodity,
    direction: n.direction,
    percentChange: n.percentChange,
    currentPrice: n.currentPrice,
    forecastPrice: n.forecastPrice,
    horizon: n.horizon,
  }));

  const buyers = await getUsersByRole("buyer");
  if (buyers.length === 0) return { sent: 0 };

  let totalSent = 0;
  for (const buyer of buyers) {
    const prefs = buyer.cropPreferences ?? [];
    const alerts = prefs.length === 0
      ? allAlerts
      : allAlerts.filter((a) => prefs.some((p) => a.commodity.toLowerCase().includes(p.toLowerCase())));
    if (alerts.length === 0) continue;
    const result = await sendDigestEmail({ toEmails: [buyer.email], role: "buyer", periodLabel: "Weekly", alerts });
    totalSent += result.sent;
  }

  console.log(`[Email] Buyer weekly digest: ${totalSent}/${buyers.length} buyer(s) emailed`);
  return { sent: totalSent };
}

export async function sendFarmerMonthlyDigest(): Promise<{ sent: number }> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const notifications = await Notification.find({
    targetRole: "farmer",
    direction: "RISE",
    createdAt: { $gte: since },
  })
    .sort({ percentChange: -1 })
    .lean();

  if (notifications.length === 0) {
    console.log("[Email] Farmer monthly digest: no RISE alerts in past 30 days — skipping");
    return { sent: 0 };
  }

  const allAlerts = notifications.map((n) => ({
    commodity: n.commodity,
    direction: n.direction,
    percentChange: n.percentChange,
    currentPrice: n.currentPrice,
    forecastPrice: n.forecastPrice,
    horizon: n.horizon,
  }));

  const farmers = await getUsersByRole("farmer");
  if (farmers.length === 0) return { sent: 0 };

  let totalSent = 0;
  for (const farmer of farmers) {
    const prefs = farmer.cropPreferences ?? [];
    const alerts = prefs.length === 0
      ? allAlerts
      : allAlerts.filter((a) => prefs.some((p) => a.commodity.toLowerCase().includes(p.toLowerCase())));
    if (alerts.length === 0) continue;
    const result = await sendDigestEmail({ toEmails: [farmer.email], role: "farmer", periodLabel: "Monthly", alerts });
    totalSent += result.sent;
  }

  console.log(`[Email] Farmer monthly digest: ${totalSent}/${farmers.length} farmer(s) emailed`);
  return { sent: totalSent };
}
