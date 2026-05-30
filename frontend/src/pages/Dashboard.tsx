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
import { ModelAccuracySection } from "../components/agro/ModelAccuracySection";
import {
  fetchDashboard,
  fetchFeaturedCrops,
  fetchSevenDay,
  fetchThirtyDay,
  type DashboardPayload,
  type ForecastPayload,
  type Role,
} from "../services/api";
import { DecisionSupportPanel } from "../components/DecisionSupportPanel";
import { useNavigate } from "react-router-dom";
import { usePipeline } from "../contexts/PipelineContext";

function recommendationUi(code: DashboardPayload["recommendation"]): {
  text: string;
  className: string;
} {
  switch (code) {
    case "BUY_EARLY_OR_HOLD":
      return { text: "HOLD / BUY EARLY", className: "agro-rec-buy" };
    case "SELL":
      return { text: "SELL / REDUCE", className: "agro-rec-sell" };
    default:
      return { text: "WAIT", className: "agro-rec-wait" };
  }
}

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const CHART_STYLE: React.CSSProperties = {
  background: "#374151",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 13,
};

type Tab = "overview" | "forecast" | "context";

export default function Dashboard() {
  const { logout, role, email } = useAuth();
  const navigate = useNavigate();
  const { pipelineBusy, startPipeline, pipeUi } = usePipeline();

  const [viewRole, setViewRole] = useState<Role>(() => role ?? "buyer");
  const [items, setItems] = useState<string[]>([]);
  const [item, setItem] = useState("");
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [f7, setF7] = useState<ForecastPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  useEffect(() => {
    if (role) setViewRole(role);
  }, [role]);

  useEffect(() => {
    void fetchFeaturedCrops()
      .then((r) => {
        setItems(r.items);
        setItem((prev) => {
          if (prev && r.items.includes(prev)) return prev;
          return r.items[0] ?? "";
        });
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!item) return;
    setErr(null);
    void Promise.all([
      fetchDashboard(item),
      fetchSevenDay(item).catch(() => null),
      fetchThirtyDay(item).catch(() => null),
    ])
      .then(([d, seven]) => {
        setDash(d as DashboardPayload);
        setF7(seven as ForecastPayload | null);
      })
      .catch((e: Error) => setErr(e.message));
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

  const trendLabel = dash?.trend_30d || "—";
  const trendUp = trendLabel.toLowerCase().includes("increas");
  const rec = dash ? recommendationUi(dash.recommendation) : null;

  return (
    <div className="agro-app">
      <AgroHeader
        lastUpdatedIso={dash?.current_price?.date ?? null}
        viewRole={viewRole}
        onRoleChange={setViewRole}
        onLogout={logout}
      />

      <main className="agro-main">
        {/* Crop selector bar */}
        <div className="agro-crop-bar card-agro">
          <div className="agro-crop-bar-left">
            <div className="agro-crop-select-wrap">
              <label className="agro-crop-label" htmlFor="crop-select">Commodity</label>
              <select
                id="crop-select"
                className="agro-select agro-crop-select"
                value={item}
                onChange={(e) => setItem(e.target.value)}
              >
                {items.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div className="agro-crop-actions">
              <button
                type="button"
                className="agro-nav-btn"
                onClick={() => navigate(`/charts?item=${encodeURIComponent(item)}`)}
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
              <button
                type="button"
                className="agro-btn-pipeline"
                disabled={pipelineBusy}
                onClick={() => startPipeline(item, f7?.batch_id ?? null)}
              >
                {pipelineBusy ? "Running…" : "Run Pipeline"}
              </button>
            </div>
          </div>
          <div className="agro-user-mini">
            <span className="muted-agro">{email}</span>
            <button type="button" className="agro-btn-ghost" onClick={logout}>
              Logout
            </button>
          </div>
        </div>

        {err && (
          <div className="agro-banner agro-banner-err" role="alert">
            {err}
          </div>
        )}

        {dash && (
          <>
            {/* Price summary — 4 stat cards, no icons */}
            <div className="agro-metrics">
              <div className="agro-metric-card agro-metric-card--flat">
                <div className="agro-metric-label">Current Price</div>
                <div className="agro-metric-val">
                  Rs. {dash.current_price?.avg_price.toFixed(2) ?? "—"}
                </div>
                <div className="agro-metric-unit">NPR / KG · today</div>
              </div>

              <div className="agro-metric-card agro-metric-card--flat">
                <div className="agro-metric-label">Avg Predicted (7d)</div>
                <div className="agro-metric-val">
                  {avgPred7 != null ? `Rs. ${avgPred7.toFixed(2)}` : "—"}
                </div>
                <div className="agro-metric-unit">NPR / KG · forecast</div>
              </div>

              <div className="agro-metric-card agro-metric-card--flat">
                <div className="agro-metric-label">30-Day Trend</div>
                <div
                  className={`agro-metric-trend ${trendUp ? "up" : ""}`}
                  style={{ fontSize: "1.25rem" }}
                >
                  {trendLabel}
                </div>
              </div>

              <div className="agro-metric-card agro-metric-card--flat">
                <div className="agro-metric-label">Recommendation</div>
                {rec && (
                  <span className={`agro-rec-pill ${rec.className}`}>{rec.text}</span>
                )}
                <div className="agro-metric-unit" style={{ marginTop: 4 }}>
                  {viewRole === "buyer" ? "for buyers" : "for farmers"}
                </div>
              </div>
            </div>

            {/* Tab navigation */}
            <div className="agro-tab-bar">
              {(["overview", "forecast", "context"] as Tab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`agro-tab-btn${activeTab === t ? " active" : ""}`}
                  onClick={() => setActiveTab(t)}
                >
                  {t === "overview" && "Overview"}
                  {t === "forecast" &&
                    (viewRole === "buyer" ? "7-Day Forecast" : "30-Day Forecast")}
                  {t === "context" && "Weather & Fuel"}
                </button>
              ))}
            </div>

            {/* ── OVERVIEW TAB ── */}
            {activeTab === "overview" && (
              <div className="agro-tab-content">
                <DecisionSupportPanel
                  dash={dash}
                  role={viewRole}
                  dieselChangePct={null}
                />

                {/* Buyer: 7-day forecast table */}
                {viewRole === "buyer" && (f7?.points?.length ?? 0) > 0 && (
                  <div className="agro-card" style={{ marginTop: "1.25rem" }}>
                    <h3 className="agro-section-title">
                      7-Day Price Forecast &mdash; {item}
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
                              <td>
                                {p.target_date ? fmtDay(p.target_date) : `Day ${i + 1}`}
                              </td>
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

                {/* Farmer: 30-day history table */}
                {viewRole === "farmer" && (dash.historical_30d?.length ?? 0) > 0 && (
                  <div className="agro-card" style={{ marginTop: "1.25rem" }}>
                    <h3 className="agro-section-title">
                      30-Day Price History &mdash; {item}
                    </h3>
                    <div style={{ overflowX: "auto" }}>
                      <table className="agro-data-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Avg (NPR/KG)</th>
                            <th>Min</th>
                            <th>Max</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...dash.historical_30d]
                            .reverse()
                            .slice(0, 15)
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
                    <p className="muted-agro" style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>
                      Showing latest 15 of {dash.historical_30d.length} days.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── FORECAST TAB ── */}
            {activeTab === "forecast" && (
              <div className="agro-tab-content">
                {viewRole === "buyer" ? (
                  <div className="agro-card">
                    <div className="agro-card-head-divider" style={{ paddingBottom: "0.75rem", marginBottom: "1rem", borderBottom: "1px solid #e2e8f0" }}>
                      <h3 className="agro-section-title" style={{ margin: 0 }}>
                        7-Day Price Prediction &mdash; {item}
                      </h3>
                      <p className="muted-agro" style={{ margin: "0.25rem 0 0" }}>
                        RandomForest model · next 7 days
                      </p>
                    </div>
                    {chart7.length === 0 ? (
                      <p className="muted-agro">
                        Run the pipeline to generate a 7-day forecast.
                      </p>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart
                          data={chart7}
                          margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                        >
                          <defs>
                            <linearGradient id="grad7d" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#3A86FF" stopOpacity={0.28} />
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
                              value: "NPR / KG",
                              angle: -90,
                              position: "insideLeft",
                              fill: "#6b7280",
                              fontSize: 11,
                            }}
                          />
                          <Tooltip
                            contentStyle={CHART_STYLE}
                            formatter={(v: number) => [
                              `Rs. ${v.toFixed(2)}`,
                              "Predicted",
                            ]}
                          />
                          <Area
                            type="monotone"
                            dataKey="price"
                            stroke="#3A86FF"
                            strokeWidth={2}
                            fill="url(#grad7d)"
                            dot={{ r: 4, fill: "#3A86FF", strokeWidth: 0 }}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                    <div style={{ marginTop: "0.75rem", textAlign: "right" }}>
                      <button
                        type="button"
                        className="agro-nav-btn"
                        onClick={() =>
                          navigate(`/charts?item=${encodeURIComponent(item)}`)
                        }
                      >
                        View All Charts
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="agro-card">
                    <div style={{ paddingBottom: "0.75rem", marginBottom: "1rem", borderBottom: "1px solid #e2e8f0" }}>
                      <h3 className="agro-section-title" style={{ margin: 0 }}>
                        30-Day Price History &mdash; {item}
                      </h3>
                      <p className="muted-agro" style={{ margin: "0.25rem 0 0" }}>
                        Actual Kalimati market prices
                      </p>
                    </div>
                    {hist30.length === 0 ? (
                      <p className="muted-agro">No historical data available.</p>
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
                            interval={Math.ceil(hist30.length / 10)}
                            axisLine={{ stroke: "#d1d5db" }}
                          />
                          <YAxis
                            tick={{ fill: "#6b7280", fontSize: 11 }}
                            axisLine={{ stroke: "#d1d5db" }}
                            domain={["auto", "auto"]}
                            label={{
                              value: "NPR / KG",
                              angle: -90,
                              position: "insideLeft",
                              fill: "#6b7280",
                              fontSize: 11,
                            }}
                          />
                          <Tooltip
                            contentStyle={CHART_STYLE}
                            formatter={(v: number) => [
                              `Rs. ${v.toFixed(2)}`,
                              "Avg Price",
                            ]}
                          />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#f59e0b"
                            strokeWidth={2}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                    <div style={{ marginTop: "0.75rem", textAlign: "right" }}>
                      <button
                        type="button"
                        className="agro-nav-btn"
                        onClick={() =>
                          navigate(`/charts?item=${encodeURIComponent(item)}`)
                        }
                      >
                        View All Charts
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── CONTEXT TAB ── */}
            {activeTab === "context" && (
              <div className="agro-tab-content">
                <div className="agro-context-grid">
                  <div className="agro-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.85rem" }}>
                      <h3 className="agro-section-title" style={{ margin: 0 }}>
                        Weather &mdash; Kathmandu
                      </h3>
                      <span className="agro-live-badge">Live</span>
                    </div>
                    {dash.weather ? (
                      <div className="agro-weather-grid">
                        <div className="agro-wx agro-wx-temp">
                          <span className="agro-wx-label">Temperature</span>
                          <strong>{dash.weather.temperature.toFixed(1)} °C</strong>
                        </div>
                        <div className="agro-wx agro-wx-rain">
                          <span className="agro-wx-label">Precipitation</span>
                          <strong>{dash.weather.rainfall.toFixed(2)} mm</strong>
                        </div>
                        <div className="agro-wx agro-wx-hum">
                          <span className="agro-wx-label">Humidity</span>
                          <strong>{dash.weather.humidity.toFixed(0)} %</strong>
                        </div>
                      </div>
                    ) : (
                      <p className="muted-agro">No weather data available.</p>
                    )}
                  </div>

                  <div className="agro-card">
                    <h3 className="agro-section-title" style={{ marginBottom: "0.85rem" }}>
                      NOC Fuel Prices
                    </h3>
                    {dash.fuel ? (
                      <div className="agro-fuel-row">
                        <div className="agro-fuel-pill petrol">
                          <span>Petrol</span>
                          <strong>Rs. {dash.fuel.petrol_price.toFixed(0)}</strong>
                        </div>
                        <div className="agro-fuel-pill diesel">
                          <span>Diesel</span>
                          <strong>Rs. {dash.fuel.diesel_price.toFixed(0)}</strong>
                        </div>
                        {dash.fuel.kerosene_price != null && (
                          <div
                            className="agro-fuel-pill"
                            style={{ background: "#dbeafe", color: "#1e40af" }}
                          >
                            <span>Kerosene</span>
                            <strong>Rs. {dash.fuel.kerosene_price.toFixed(0)}</strong>
                          </div>
                        )}
                        {dash.fuel.lpg_price != null && (
                          <div
                            className="agro-fuel-pill"
                            style={{ background: "#ede9fe", color: "#5b21b6" }}
                          >
                            <span>LPG / cyl</span>
                            <strong>Rs. {dash.fuel.lpg_price.toFixed(0)}</strong>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="muted-agro">
                        No fuel data — run pipeline to refresh.
                      </p>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: "1.25rem" }}>
                  <ModelAccuracySection
                    vegetable_model_accuracy={dash.vegetable_model_accuracy ?? []}
                    accuracy_summary={
                      dash.accuracy_summary ?? {
                        overall_accuracy_pct: null,
                        avg_pct_error: null,
                        avg_price_error_npr: null,
                        records_used: 0,
                        computed_at: null,
                      }
                    }
                  />
                </div>
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
