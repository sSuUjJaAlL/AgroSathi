import { TrendingUp, TrendingDown, Fuel, ShoppingCart, Sprout } from "lucide-react";
import type { DashboardPayload, Role } from "../services/api";

interface Props {
  dash: DashboardPayload;
  role: Role;
  dieselChangePct?: number | null;
}

export function DecisionSupportPanel({ dash, role, dieselChangePct }: Props) {
  const current = dash.current_price?.avg_price ?? null;
  const hist = dash.historical_30d ?? [];
  const avg30 = hist.length > 0 ? hist.reduce((s, r) => s + r.avg_price, 0) / hist.length : null;
  const trend = dash.trend_30d ?? "Stable";
  const rec = dash.recommendation;

  const aboveAvg = current != null && avg30 != null && current > avg30;
  const pctVsAvg = current != null && avg30 != null ? ((current - avg30) / avg30) * 100 : null;

  const hasDieselPressure = dieselChangePct != null && dieselChangePct > 3;

  return (
    <section className="agro-card" style={{ border: "2px solid #2d6a4f", borderRadius: 12 }}>
      <div className="agro-card-head">
        {role === "buyer" ? <ShoppingCart size={20} style={{ color: "#2d6a4f" }} /> : <Sprout size={20} style={{ color: "#2d6a4f" }} />}
        <h2 className="agro-card-title" style={{ color: "#2d6a4f" }}>
          {role === "buyer" ? "Buyer Decision Support" : "Farmer Decision Support"}
        </h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        {/* Main recommendation */}
        <div className="agro-card agro-mini-card" style={{ margin: 0, background: rec === "BUY_EARLY_OR_HOLD" ? "#f0fdf4" : rec === "SELL" ? "#fef2f2" : "#fafafa" }}>
          {role === "buyer" ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Buy Now or Wait?</div>
              {rec === "BUY_EARLY_OR_HOLD" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534" }}>
                  <TrendingUp size={18} />
                  <span><strong>Buy early or hold stock</strong> — price forecast is rising.</span>
                </div>
              ) : rec === "SELL" ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#991b1b" }}>
                  <TrendingDown size={18} />
                  <span><strong>Wait to buy</strong> — price expected to drop.</span>
                </div>
              ) : (
                <span className="muted-agro">Price trend is stable — no urgency either way.</span>
              )}
            </>
          ) : (
            <>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Good Time to Sell?</div>
              {aboveAvg ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#166534" }}>
                  <TrendingUp size={18} />
                  <span>
                    <strong>Yes — sell now.</strong> Current price Rs.{current?.toFixed(0)} is{" "}
                    {pctVsAvg != null ? `${pctVsAvg.toFixed(1)}%` : ""} above 30-day average.
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#92400e" }}>
                  <TrendingDown size={18} />
                  <span>
                    <strong>Hold if possible.</strong> Current price is{" "}
                    {pctVsAvg != null ? `${Math.abs(pctVsAvg).toFixed(1)}%` : ""} below 30-day average.
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 30-day vs avg */}
        <div className="agro-card agro-mini-card" style={{ margin: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>Price vs 30-Day Average</div>
          {current != null && avg30 != null ? (
            <>
              <div style={{ fontSize: 13 }}>
                Current: <strong>Rs. {current.toFixed(0)}</strong>
              </div>
              <div style={{ fontSize: 13 }}>
                30-day avg: <strong>Rs. {avg30.toFixed(0)}</strong>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>
                Trend:{" "}
                <span style={{ fontWeight: 700, color: trend === "Increasing" ? "#ef4444" : trend === "Decreasing" ? "#3b82f6" : "#6b7280" }}>
                  {trend}
                </span>
              </div>
            </>
          ) : (
            <p className="muted-agro">No price data loaded.</p>
          )}
        </div>
      </div>

      {/* Fuel impact indicator */}
      {hasDieselPressure && (
        <div style={{ marginTop: "1rem", padding: "0.75rem", borderRadius: 8, background: "#fef3c7", display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Fuel size={18} style={{ color: "#b45309", flexShrink: 0, marginTop: 2 }} />
          <div>
            <strong style={{ color: "#92400e" }}>Diesel up {dieselChangePct?.toFixed(1)}% this week</strong>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "#92400e" }}>
              Expect transport cost pressure on perishables within 10–14 days. LSTM model has detected this pattern historically.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
