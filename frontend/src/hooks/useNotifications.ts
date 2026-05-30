import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "../services/api";

export interface AppNotification {
  _id: string;
  commodity: string;
  direction: "DROP" | "RISE";
  horizon: "7d" | "30d";
  message: string;
  percentChange: number;
  currentPrice: number;
  forecastPrice: number;
  isRead: boolean;
  createdAt: string;
}

interface UseNotificationsReturn {
  notifications: AppNotification[];
  unreadCount: number;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  isLoading: boolean;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  const token = getToken();
  if (!token) return null;
  try {
    const res = await fetch(path, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function useNotifications(): UseNotificationsReturn {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    const data = await apiFetch<{ count: number }>("/api/notifications/unread-count");
    if (data) setUnreadCount(data.count);
  }, []);

  const fetchPage = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    const data = await apiFetch<{ notifications: AppNotification[]; pages: number }>(
      `/api/notifications?page=${pageNum}&limit=20`
    );
    if (data) {
      setNotifications((prev) => (pageNum === 1 ? data.notifications : [...prev, ...data.notifications]));
      setHasMore(pageNum < data.pages);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void fetchPage(1);
    void fetchUnreadCount();

    const token = getToken();
    if (token) {
      const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
      esRef.current = es;

      es.addEventListener("notification", (e) => {
        const notif = JSON.parse((e as MessageEvent<string>).data) as AppNotification;
        setNotifications((prev) => [{ ...notif, isRead: false }, ...prev]);
        setUnreadCount((c) => c + 1);
      });

      es.onerror = () => {
        es.close();
      };
    }

    const poll = setInterval(() => void fetchUnreadCount(), 60_000);

    return () => {
      clearInterval(poll);
      esRef.current?.close();
    };
  }, [fetchPage, fetchUnreadCount]);

  const markRead = useCallback(async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await apiFetch("/api/notifications/read-all", { method: "PATCH" });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }, []);

  const loadMore = useCallback(async () => {
    const next = page + 1;
    setPage(next);
    await fetchPage(next);
  }, [page, fetchPage]);

  return { notifications, unreadCount, markRead, markAllRead, loadMore, hasMore, isLoading };
}
