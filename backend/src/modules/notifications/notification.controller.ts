import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { Notification } from "../../models/Notification.js";
import { sseRegistry } from "./sse.registry.js";
import { env } from "../../config/env.js";
import type { AuthPayload } from "../../middleware/auth.middleware.js";
import type { UserRole } from "../../models/User.js";

export async function getNotifications(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: Record<string, unknown> = { targetRole: role };
  if (req.query.unread === "true") filter.readBy = { $ne: userId };
  if (req.query.direction === "DROP" || req.query.direction === "RISE") {
    filter.direction = req.query.direction;
  }

  const [total, docs] = await Promise.all([
    Notification.countDocuments(filter),
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);

  res.json({
    notifications: docs.map((n) => ({
      _id: String(n._id),
      commodity: n.commodity,
      direction: n.direction,
      horizon: n.horizon,
      message: n.message,
      percentChange: n.percentChange,
      currentPrice: n.currentPrice,
      forecastPrice: n.forecastPrice,
      isRead: (n.readBy as string[]).includes(userId),
      createdAt: n.createdAt,
    })),
    total,
    page,
    pages: Math.ceil(total / limit),
  });
}

export async function markRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  await Notification.updateOne({ _id: req.params.id }, { $addToSet: { readBy: userId } });
  res.json({ ok: true });
}

export async function markAllRead(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const role = req.user!.role;
  await Notification.updateMany({ targetRole: role }, { $addToSet: { readBy: userId } });
  res.json({ ok: true });
}

export async function getUnreadCount(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const role = req.user!.role;
  const count = await Notification.countDocuments({ targetRole: role, readBy: { $ne: userId } });
  res.json({ count });
}

// EventSource can't send custom headers, so token comes from query param
export function streamNotifications(req: Request, res: Response): void {
  const tokenFromQuery = req.query.token as string | undefined;
  const tokenFromHeader = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = tokenFromHeader ?? tokenFromQuery;

  if (!token) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  let user: AuthPayload;
  try {
    user = jwt.verify(token, env.jwtSecret) as AuthPayload;
  } catch {
    res.status(401).json({ message: "Invalid token" });
    return;
  }

  const clientId = randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  sseRegistry.add(clientId, user.role as UserRole, user.sub, res);

  const ping = setInterval(() => {
    try {
      res.write("event: ping\ndata: {}\n\n");
    } catch {
      clearInterval(ping);
      sseRegistry.remove(clientId);
    }
  }, 30_000);

  req.on("close", () => {
    clearInterval(ping);
    sseRegistry.remove(clientId);
  });
}
