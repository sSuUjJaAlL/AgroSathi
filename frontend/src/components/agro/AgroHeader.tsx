import type { Role } from "../../services/api";
import { NotificationBell } from "../notifications/NotificationBell";

export function AgroHeader({
  lastUpdatedIso,
  viewRole,
  onRoleChange,
  onLogout,
}: {
  lastUpdatedIso: string | null;
  viewRole: Role;
  onRoleChange: (r: Role) => void;
  formattedToday?: string;
  onLogout?: () => void;
}) {
  const updated =
    lastUpdatedIso != null
      ? new Date(lastUpdatedIso).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  return (
    <header className="agro-header-main">
      <div className="agro-header-inner">
        <div className="agro-brand-row">
          <span className="agro-logo-dot" aria-hidden />
          <div>
            <div className="agro-brand-title">AgroPredict Nepal</div>
            <div className="agro-brand-tagline">
              Live Kalimati prices &middot; ML forecasts &middot; Weather &amp; fuel context
            </div>
          </div>
        </div>

        <div className="agro-header-actions">
          <span className="agro-updated-pill">
            Updated: <strong>{updated}</strong>
          </span>
          <NotificationBell />
          {onLogout && (
            <button
              type="button"
              className="agro-logout-btn"
              onClick={onLogout}
              aria-label="Log out"
            >
              Logout
            </button>
          )}
          <div className="agro-role-switch" role="tablist" aria-label="Workspace role">
            <button
              type="button"
              role="tab"
              aria-selected={viewRole === "buyer"}
              className={`agro-role-btn ${viewRole === "buyer" ? "active" : ""}`}
              onClick={() => onRoleChange("buyer")}
            >
              Buyer
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewRole === "farmer"}
              className={`agro-role-btn ${viewRole === "farmer" ? "active" : ""}`}
              onClick={() => onRoleChange("farmer")}
            >
              Farmer
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
