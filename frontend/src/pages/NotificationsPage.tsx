import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell } from "lucide-react";
import { useNotifications, type AppNotification } from "../hooks/useNotifications";

type FilterTab = "all" | "unread" | "drop" | "rise";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function NotifCard({ n, onMarkRead }: { n: AppNotification; onMarkRead: (id: string) => void }) {
  const isDrop = n.direction === "DROP";
  return (
    <div
      className={`notif-card ${n.isRead ? "notif-card--read" : ""}`}
      onClick={() => { if (!n.isRead) onMarkRead(n._id); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" && !n.isRead) onMarkRead(n._id); }}
    >
      <div className="notif-card-left">
        <span className={`notif-direction-icon ${isDrop ? "notif-direction-icon--drop" : "notif-direction-icon--rise"}`}>
          {isDrop ? "↓" : "↑"}
        </span>
      </div>
      <div className="notif-card-body">
        <div className="notif-card-top">
          <span className="notif-card-commodity">{n.commodity}</span>
          <span className={`notif-chip ${isDrop ? "notif-chip--drop" : "notif-chip--rise"}`}>
            {isDrop ? `Price Drop ${Math.abs(n.percentChange).toFixed(1)}%` : `Price Rise ${n.percentChange.toFixed(1)}%`}
          </span>
          <span className="notif-chip notif-chip--horizon">{n.horizon} forecast</span>
          {!n.isRead && <span className="notif-chip notif-chip--unread">New</span>}
        </div>
        <p className="notif-card-msg">{n.message}</p>
        <div className="notif-card-prices">
          <span>Current: <strong>NPR {n.currentPrice.toFixed(0)}</strong></span>
          <span>Forecast: <strong>NPR {n.forecastPrice.toFixed(0)}</strong></span>
        </div>
        <span className="notif-card-date">{formatDate(n.createdAt)}</span>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  const { notifications, unreadCount, markRead, markAllRead, loadMore, hasMore, isLoading } = useNotifications();
  const [tab, setTab] = useState<FilterTab>("all");

  const filtered = notifications.filter((n) => {
    if (tab === "unread") return !n.isRead;
    if (tab === "drop") return n.direction === "DROP";
    if (tab === "rise") return n.direction === "RISE";
    return true;
  });

  return (
    <div className="notif-page">
      <div className="notif-page-header">
        <Link to="/dashboard" className="notif-back-btn">
          <ArrowLeft size={18} strokeWidth={2} />
          Back to Dashboard
        </Link>
        <div className="notif-page-title-row">
          <Bell size={22} strokeWidth={2} />
          <h1 className="notif-page-title">Notifications</h1>
          {unreadCount > 0 && <span className="notif-badge notif-badge--large">{unreadCount}</span>}
        </div>
        {unreadCount > 0 && (
          <button type="button" className="notif-mark-all-btn notif-mark-all-btn--page" onClick={() => void markAllRead()}>
            Mark all as read
          </button>
        )}
      </div>

      <div className="notif-tabs">
        {(["all", "unread", "drop", "rise"] as FilterTab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={`notif-tab-btn ${tab === t ? "notif-tab-btn--active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "all" && "All"}
            {t === "unread" && `Unread${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
            {t === "drop" && "Price Drop"}
            {t === "rise" && "Price Rise"}
          </button>
        ))}
      </div>

      <div className="notif-cards">
        {filtered.length === 0 && !isLoading && (
          <p className="notif-empty notif-empty--page">No notifications in this category.</p>
        )}
        {filtered.map((n) => (
          <NotifCard key={n._id} n={n} onMarkRead={(id) => void markRead(id)} />
        ))}
      </div>

      {hasMore && (
        <div className="notif-load-more-wrap">
          <button type="button" className="notif-load-more-btn" onClick={() => void loadMore()} disabled={isLoading}>
            {isLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
