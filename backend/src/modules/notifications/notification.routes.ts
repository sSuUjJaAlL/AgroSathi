import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware.js";
import {
  getNotifications,
  markRead,
  markAllRead,
  getUnreadCount,
  streamNotifications,
} from "./notification.controller.js";

export const notificationRouter = Router();

// SSE stream: handles its own auth (EventSource API doesn't support custom headers)
notificationRouter.get("/stream", streamNotifications);

notificationRouter.use(authMiddleware);

notificationRouter.get("/unread-count", getUnreadCount);
notificationRouter.get("/", getNotifications);
notificationRouter.patch("/read-all", markAllRead);
notificationRouter.patch("/:id/read", markRead);
