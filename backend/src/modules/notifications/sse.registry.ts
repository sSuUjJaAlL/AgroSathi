import type { Response } from "express";
import type { INotification } from "../../models/Notification.js";
import type { UserRole } from "../../models/User.js";

interface SseClient {
  id: string;
  role: UserRole;
  userId: string;
  res: Response;
}

class SseRegistry {
  private clients = new Map<string, SseClient>();

  add(id: string, role: UserRole, userId: string, res: Response): void {
    this.clients.set(id, { id, role, userId, res });
  }

  remove(id: string): void {
    this.clients.delete(id);
  }

  broadcast(targetRole: UserRole, notification: INotification): void {
    const payload = JSON.stringify({
      _id: String(notification._id),
      commodity: notification.commodity,
      direction: notification.direction,
      horizon: notification.horizon,
      message: notification.message,
      percentChange: notification.percentChange,
      currentPrice: notification.currentPrice,
      forecastPrice: notification.forecastPrice,
      createdAt: notification.createdAt,
    });
    for (const client of this.clients.values()) {
      if (client.role === targetRole) {
        try {
          client.res.write(`event: notification\ndata: ${payload}\n\n`);
        } catch {
          this.clients.delete(client.id);
        }
      }
    }
  }
}

export const sseRegistry = new SseRegistry();
