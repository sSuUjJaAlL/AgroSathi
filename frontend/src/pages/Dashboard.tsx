import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "../auth/AuthContext";
import { AgroHeader } from "../components/agro/AgroHeader";
import {
  fetchDashboard,
  fetchFeaturedCrops,
  fetchSevenDay,
  type DashboardPayload,
  type ForecastPayload,
  type Role,
} from "../services/api";
import { useNavigate } from "react-router-dom";
import { usePipeline } from "../contexts/PipelineContext";

type RecCode = "BUY_EARLY_OR_HOLD" | "SELL" | "WAIT";

interface RecConfig {
  label: string;
  bg: string;
  border: string;
  color: string;
  buyerText: (cur: number | null, pred: number | null) => string;
  farmerText: (cur: number | null, avg30: number | null) => string;
}

const REC: Record<RecCode, RecConfig> = {
  BUY_EARLY_OR_HOLD: {
    label: "HOLD / BUY EARLY",
    bg: "#f0fdf4",
    border: "#16a34a",
    color: "#15803d",
    buyerText: (cur, pred) =>
      `Price forecast is rising. ${cur != null && pred != null ? `Today Rs.${cur.toFixed(0)} → 7-day avg Rs.${pred.toFixed(0)}/KG.` : ""} Buy early or hold existing stock.`,
    farmerText: (cur, avg30) =>
      `Current price is above the 30-day average. ${cur != null && avg30 != null ? `Today Rs.${cur.toFixed(0)} vs avg Rs.${avg30.toFixed(0)}/KG.` : ""} Good time to sell at market.`,
  },
  SELL: {
    label: "SELL / REDUCE STOCK",
    bg: "#fff1f2",
    border: "#dc2626",
    color: "#991b1b",
    buyerText: (cur, pred) =>
      `Price is expected to fall. ${cur != null && pred != null ? `Today Rs.${cur.toFixed(0)} → forecast Rs.${pred.toFixed(0)}/KG.` : ""} Wait before buying more stock.`,
    farmerText: (cur, avg30) =>
      `Price is expected to drop. ${cur != null && avg30 != null ? `Today Rs.${cur.toFixed(0)} vs avg Rs.${avg30.toFixed(0)}/KG.` : ""} Consider selling now before the fall.`,
  },
  WAIT: {
    label: "WAIT — STABLE MARKET",
    bg: "#f8fafc",
    border: "#64748b",
    color: "#475569",
    buyerText: (cur) =>
      `Market is currently stable. ${cur != null ? `Current price Rs.${cur.toFixed(0)}/KG.` : ""} No urgent action needed — monitor for the next few days.`,
    farmerText: (cur) =>
      `Market is stable. ${cur != null ? `Current price Rs.${cur.toFixed(0)}/KG.` : ""} Hold stock and wait for a better selling window.`,
  },
};

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const TT: React.CSSProperties = {
  background: "#1e293b",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 13,
};

export default function Dashboard() {
  const { logout, role, email } = useAuth();
  const navigate = useNavigate();
  const { pipelineBusy, startPipeline, pipeUi } = usePipeline();

  const [viewRole, setViewRole] = useState<Role>(() => role ?? "buyer");
  const [items, setItems] = useState<string[]>([]);
  const [item, setItem] = useState("");
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [f7, setF7] = useState<ForecastPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (role) setViewRole(role);
  }, [role]);

  useEffect(() => {
    void fetchFeaturedCrops()
      .then((r) => {
        setItems(r.items);
        setItem((prev) =>
          prev && r.items.includes(prev) ? prev : (r.items[0] ?? "")
        );
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!item) return;
    setErr(null);
    setLoading(true);
    void Promise.all([
      fetchDashboard(item),
      fetchSevenDay(item).catch(() => null),
    ])
      .then(([d, seven]) => {
        setDash(d as DashboardPayload);
        setF7(seven as ForecastPayload | null);
        setLoading(false);
      })
      .catch((e: Error) => {
        setErr(e.message);
        setLoading(false);
      });
  }, [item, pipeUi.refreshTick]);

  const chart7 = useMemo(
    () =>
      (f7?.points ?? []).map((p) => ({
        day: p.target_date ? fmtDay(p.target_date) : "",
        price: p.predicted_price,
      })),
    [f7]
  );

  const hist30 = useMemo(
    () =>
      (dash?.historical_30d ?? []).map((r) => ({
        day: fmtDay(r.date),
        price: r.avg_price,
      })),
    [dash?.historical_30d]
  );

  const avgPred7 =
    (f7?.points?.length ?? 0) > 0
      ? f7!.points.reduce((s, p) => s + p.predicted_price, 0) / f7!.points.length
      : null;

  const avg30 =
    (dash?.historical_30d?.length ?? 0) > 0
      ? dash!.historical_30d.reduce((s, r) => s + r.avg_price, 0) /
        dash!.historical_30d.length
      : null;

  const current = dash?.current_price?.avg_price ?? null;
  const rec = (dash?.recommendation ?? "WAIT") as RecCode;
  const cfg = REC[rec];
  const trend = dash?.trend_30d ?? "—";

  return (
    <div className="agro-app">
      <AgroHeader
        lastUpdatedIso={dash?.current_price?.date ?? null}
        viewRole={viewRole}
        onRoleChange={setViewRole}
        onLogout={logout}
      />

      <main className="agro-main">

        {/* ── HERO CROP SELECTOR ─────────────────────────────── */}
        <div className="dash-hero card-agro">
          <div className="dash-hero-top">
            <div>
              <h1 className="dash-hero-title">Nepal Agricultural Price Forecast</h1>
              <p className="dash-hero-sub">
                {viewRole === "buyer"
                  ? "Select a commodity to see today's price, 7-day ML forecast, and buying recommendation."
                  : "Select a commodity to see today's price, 30-day history, and selling recommendation."}
              </p>
            </div>
            <div className="agro-user-mini">
              <span className="muted-agro">{email}</span>
              <button type="button" className="agro-btn-ghost" onClick={logout}>
                Logout
              </button>
            </div>
          </div>

          <div className="dash-hero-bottom">
            <div className="dash-hero-select-wrap">
              <label className="agro-crop-label" htmlFor="crop-hero">
                Select Commodity
              </label>
              <select
                id="crop-hero"
                className="dash-hero-select"
                value={item}
                onChange={(e) => setItem(e.target.value)}
              >
                {items.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>

            <div className="dash-hero-actions">
              <button
                type="button"
                className="agro-btn-pipeline"
                disabled={pipelineBusy}
                onClick={() => startPipeline(item, f7?.batch_id ?? null)}
              >
                {pipelineBusy ? "Running…" : "Run Pipeline"}
              </button>
              <button
                type="button"
                className="agro-nav-btn"
                onClick={() =>
                  navigate(`/charts?item=${encodeURIComponent(item)}`)
                }
              >
                View Charts
              </button>
              <button
                type="button"
                className="agro-nav-btn"
                onClick={() => navigate("/crop-preferences")}
              >
                Crop Alerts
              </button>
            </div>
          </div>
        </div>

        {err && (
          <div className="agro-banner agro-banner-err" role="alert">
            {err}
          </div>
        )}
        {loading && !dash && (
          <div className="agro-banner" role="status">
            Loading data for {item}…
          </div>
        )}

        {/* ── DATA SECTION (only after crop loads) ────────────── */}
        {dash && (
          <>
            {/* RECOMMENDATION — big, colored, full-width */}
            <div
              className="dash-rec-card"
              style={{ background: cfg.bg, borderColor: cfg.border }}
            >
              <div
                className="dash-rec-badge"
                style={{ background: cfg.border }}
              >
                {viewRole === "buyer" ? "Buyer Recommendation" : "Farmer Recommendation"}
              </div>

              <div className="dash-rec-label" style={{ color: cfg.color }}>
                {cfg.label}
              </div>

              <p className="dash-rec-text" style={{ color: cfg.color }}>
                {viewRole === "buyer"
                  ? cfg.buyerText(current, avgPred7)
                  : cfg.farmerText(current, avg30)}
              </p>

              <div className="dash-rec-stats">
                <div className="dash-rec-stat">
                  <span className="dash-rec-stat-label">Today's Price</span>
                  <span className="dash-rec-stat-val">
                    Rs.&nbsp;{current?.toFixed(2) ?? "—"}
                  </span>
                  <span className="dash-rec-stat-unit">NPR / KG</span>
                </div>

                {viewRole === "buyer" ? (
                  <div className="dash-rec-stat">
                    <span className="dash-rec-stat-label">7-Day Avg Forecast</span>
                    <span className="dash-rec-stat-val">
                      Rs.&nbsp;{avgPred7?.toFixed(2) ?? "—"}
                    </span>
                    <span className="dash-rec-stat-unit">NPR / KG</span>
                  </div>
                ) : (
                  <div className="dash-rec-stat">
                    <span className="dash-rec-stat-label">30-Day Average</span>
                    <span className="dash-rec-stat-val">
                      Rs.&nbsp;{avg30?.toFixed(2) ?? "—"}
                    </span>
                    <span className="dash-rec-stat-unit">NPR / KG</span>
                  </div>
                )}

                <div className="dash-rec-stat">
                  <span className="dash-rec-stat-label">Market Trend</span>
                  <span
                    className="dash-rec-stat-val"
                    style={{ fontSize: "1.1rem" }}
                  >
                    {trend}
                  </span>
                  <span className="dash-rec-stat-unit">30-day direction</span>
                </div>

                <div className="dash-rec-stat">
                  <span className="dash-rec-stat-label">Commodity</span>
                  <span
                    className="dash-rec-stat-val"
                    style={{ fontSize: "1rem", fontWeight: 700 }}
                  >
                    {item}
                  </span>
                  <span className="dash-rec-stat-unit">Kalimati Market</span>
                </div>
              </div>
            </div>

            {/* INLINE CHART — buyer=7d, farmer=30d */}
            <div className="agro-card dash-chart-card">
              <div className="dash-chart-head">
                <div>
                  <h2 className="dash-chart-title">
                    {viewRole === "buyer"
                      ? `7-Day Price Forecast — ${item}`
                      : `30-Day Price History — ${item}`}
                  </h2>
                  <p className="muted-agro" style={{ margin: "2px 0 0", fontSize: "0.82rem" }}>
                    {viewRole === "buyer"
                      ? "RandomForest ML model · next 7 days"
                      : "Actual Kalimati market data · last 30 days"}
                  </p>
                </div>
                <button
                  type="button"
                  className="agro-nav-btn"
                  onClick={() =>
                    navigate(`/charts?item=${encodeURIComponent(item)}`)
                  }
                >
                  Full Charts
                </button>
              </div>

              {viewRole === "buyer" ? (
                chart7.length === 0 ? (
                  <p
                    className="muted-agro"
                    style={{ padding: "2.5rem 0", textAlign: "center" }}
                  >
                    Run the pipeline to generate a 7-day forecast.
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart
                      data={chart7}
                      margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="g7d" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3A86FF" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#3A86FF" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                      <XAxis
                        dataKey="day"
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        axisLine={{ stroke: "#d1d5db" }}
                      />
                      <YAxis
                        tick={{ fill: "#6b7280", fontSize: 11 }}
                        axisLine={{ stroke: "#d1d5db" }}
                        domain={["auto", "auto"]}
                        label={{
                          value: "NPR/KG",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#6b7280",
                          fontSize: 11,
                        }}
                      />
                      <Tooltip
                        contentStyle={TT}
                        formatter={(v: number) => [`Rs. ${v.toFixed(2)}`, "Predicted"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="price"
                        stroke="#3A86FF"
                        strokeWidth={2.5}
                        fill="url(#g7d)"
                        dot={{ r: 5, fill: "#3A86FF", strokeWidth: 0 }}
                        activeDot={{ r: 7 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )
              ) : hist30.length === 0 ? (
                <p
                  className="muted-agro"
                  style={{ padding: "2.5rem 0", textAlign: "center" }}
                >
                  No historical data available.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={hist30}
                    margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                    <XAxis
                      dataKey="day"
                      tick={{ fill: "#6b7280", fontSize: 10 }}
                      axisLine={{ stroke: "#d1d5db" }}
                      interval={Math.ceil(hist30.length / 10)}
                    />
                    <YAxis
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      axisLine={{ stroke: "#d1d5db" }}
                      domain={["auto", "auto"]}
                      label={{
                        value: "NPR/KG",
                        angle: -90,
                        position: "insideLeft",
                        fill: "#6b7280",
                        fontSize: 11,
                      }}
                    />
                    <Tooltip
                      contentStyle={TT}
                      formatter={(v: number) => [`Rs. ${v.toFixed(2)}`, "Avg Price"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* PRICE TABLE — buyer=7d forecast, farmer=30d history */}
            {viewRole === "buyer" && (f7?.points?.length ?? 0) > 0 && (
              <div className="agro-card dash-table-card">
                <h3 className="agro-section-title" style={{ marginBottom: "0.85rem" }}>
                  7-Day Forecast Details — {item}
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="agro-data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Predicted Price (NPR/KG)</th>
                        <th>Confidence</th>
                        <th>Signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f7!.points.map((p, i) => (
                        <tr key={i}>
                          <td>{p.target_date ? fmtDay(p.target_date) : `Day ${i + 1}`}</td>
                          <td>
                            <strong>Rs. {p.predicted_price.toFixed(2)}</strong>
                          </td>
                          <td>{p.confidence ?? "—"}</td>
                          <td>
                            <span
                              className={`agro-band-pill ${
                                p.trend === "Increasing"
                                  ? "agro-band-red"
                                  : p.trend === "Decreasing"
                                  ? "agro-band-green"
                                  : "agro-band-muted"
                              }`}
                            >
                              {p.trend ?? "Stable"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {viewRole === "farmer" && (dash.historical_30d?.length ?? 0) > 0 && (
              <div className="agro-card dash-table-card">
                <h3 className="agro-section-title" style={{ marginBottom: "0.85rem" }}>
                  30-Day Price History — {item}
                </h3>
                <div style={{ overflowX: "auto" }}>
                  <table className="agro-data-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Avg Price (NPR/KG)</th>
                        <th>Min</th>
                        <th>Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...dash.historical_30d]
                        .reverse()
                        .slice(0, 14)
                        .map((r, i) => (
                          <tr key={i}>
                            <td>{fmtDay(r.date)}</td>
                            <td>
                              <strong>Rs. {r.avg_price.toFixed(2)}</strong>
                            </td>
                            <td className="muted-agro">
                              Rs. {r.min_price.toFixed(2)}
                            </td>
                            <td className="muted-agro">
                              Rs. {r.max_price.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <p
                  className="muted-agro"
                  style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}
                >
                  Showing latest 14 of {dash.historical_30d.length} days. &nbsp;
                  <button
                    type="button"
                    className="agro-nav-btn"
                    style={{ display: "inline", padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                    onClick={() =>
                      navigate(`/charts?item=${encodeURIComponent(item)}`)
                    }
                  >
                    View full history
                  </button>
                </p>
              </div>
            )}
          </>
        )}
      </main>

      <footer className="agro-footer">
        AgroPredict Nepal | Agricultural Price Prediction System | Final Year CSIT Project
      </footer>
    </div>
  );
}
