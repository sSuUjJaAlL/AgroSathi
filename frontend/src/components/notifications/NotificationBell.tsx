import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useNotifications, type AppNotification } from "../../hooks/useNotifications";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function NotifItem({ n, onMarkRead }: { n: AppNotification; onMarkRead: (id: string) => void }) {
  const isDrop = n.direction === "DROP";
  return (
    <div
      className={`notif-item ${n.isRead ? "notif-item--read" : ""}`}
      onClick={() => { if (!n.isRead) onMarkRead(n._id); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" && !n.isRead) onMarkRead(n._id); }}
    >
      <div className="notif-item-top">
        <span className="notif-commodity">{n.commodity}</span>
        <span className={`notif-chip ${isDrop ? "notif-chip--drop" : "notif-chip--rise"}`}>
          {isDrop ? `↓ ${Math.abs(n.percentChange).toFixed(1)}%` : `↑ ${n.percentChange.toFixed(1)}%`}
        </span>
      </div>
      <p className="notif-msg">{n.message}</p>
      <span className="notif-time">{timeAgo(n.createdAt)}</span>
    </div>
  );
}

export function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const recent = notifications.slice(0, 10);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={20} strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-dropdown-header">
            <span className="notif-dropdown-title">Notifications</span>
            {unreadCount > 0 && (
              <button type="button" className="notif-mark-all-btn" onClick={() => void markAllRead()}>
                Mark all read
              </button>
            )}
          </div>

          <div className="notif-list">
            {recent.length === 0 ? (
              <p className="notif-empty">No notifications yet.</p>
            ) : (
              recent.map((n) => (
                <NotifItem key={n._id} n={n} onMarkRead={(id) => void markRead(id)} />
              ))
            )}
          </div>

          <div className="notif-dropdown-footer">
            <Link to="/notifications" onClick={() => setOpen(false)} className="notif-view-all">
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
