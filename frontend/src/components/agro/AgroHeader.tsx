import { Clock, LogOut, Tractor } from "lucide-react";
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
      ? new Date(lastUpdatedIso).toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })
      : "—";

  return (
    <>
      <header className="agro-header-main">
        <div className="agro-header-inner">
          <div className="agro-brand-row">
            <span className="agro-logo-dot" aria-hidden />
            <span className="agro-brand-title">AgroPredict Nepal</span>
          </div>
          <div className="agro-header-actions">
            <div className="agro-updated-pill">
              <Clock size={15} strokeWidth={2.2} />
              <span>
                Updated: <strong>{updated}</strong>
              </span>
            </div>
            <NotificationBell />
            {onLogout && (
              <button type="button" className="agro-logout-btn" onClick={onLogout} aria-label="Log out">
                <LogOut size={16} strokeWidth={2} />
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
                <Tractor size={16} strokeWidth={2} />
                Farmer
              </button>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
