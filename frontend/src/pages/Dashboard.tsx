import { useEffect, useState } from "react";
import {
  Bell,
  ChartLine,
  Coins,
  Fuel,
  Lightbulb,
  LineChart as LineChartIcon,
  Play,
  Search,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
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

function recommendationUi(code: DashboardPayload["recommendation"]): { text: string; className: string } {
  switch (code) {
    case "BUY_EARLY_OR_HOLD":
      return { text: "HOLD / BUY EARLY", className: "agro-rec-buy" };
    case "SELL":
      return { text: "SELL / REDUCE", className: "agro-rec-sell" };
    default:
      return { text: "WAIT", className: "agro-rec-wait" };
  }
}

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

  // Re-fetch when item changes OR when pipeline succeeds (refreshTick increments)
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

  const avgPred7 =
    (f7?.points?.length ?? 0) > 0
      ? f7!.points.reduce((s, p) => s + p.predicted_price, 0) / f7!.points.length
      : null;

  const trendLabel = dash?.trend_30d || "—";
  const trendUp = trendLabel.toLowerCase().includes("increase");

  const priceContextIso = dash?.current_price?.date ?? null;
  const formattedToday =
    priceContextIso != null
      ? new Date(priceContextIso).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : new Date().toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        });

  const rec = dash ? recommendationUi(dash.recommendation) : null;

  return (
    <div className="agro-app">
      <AgroHeader
        lastUpdatedIso={dash?.current_price?.date ?? priceContextIso}
        viewRole={viewRole}
        onRoleChange={setViewRole}
        formattedToday={formattedToday}
        onLogout={logout}
      />

      <main className="agro-main">
        <div className="agro-controls card-agro">
          <div className="agro-select-block">
            <label className="agro-select-label">
              <Search size={16} strokeWidth={2.2} aria-hidden />
              Select Commodity
            </label>
            <select className="agro-select" value={item} onChange={(e) => setItem(e.target.value)}>
              {items.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>

          <div className="agro-nav-btns">
            <button
              type="button"
              className="agro-nav-btn"
              onClick={() => navigate(`/charts?item=${encodeURIComponent(item)}`)}
            >
              <LineChartIcon size={15} aria-hidden /> View Charts
            </button>
            <button
              type="button"
              className="agro-nav-btn"
              onClick={() => navigate("/crop-preferences")}
            >
              <Bell size={15} aria-hidden /> Crop Alerts
            </button>
          </div>

          <div className="agro-pipeline-block">
            <div className="agro-pipeline-cap">Data Pipeline</div>
            <button
              type="button"
              className="agro-btn-pipeline"
              disabled={pipelineBusy}
              onClick={() => startPipeline(item, f7?.batch_id ?? null)}
            >
              <Play size={18} fill="currentColor" aria-hidden />
              {pipelineBusy ? "Running…" : "Run Pipeline"}
            </button>
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

        <div className="agro-metrics">
          <div className="agro-metric-card">
            <div className="agro-metric-ico agro-ico-green">
              <Coins size={22} />
            </div>
            <div className="agro-metric-body">
              <div className="agro-metric-label">Current Price</div>
              <div className="agro-metric-val">
                Rs. {dash?.current_price?.avg_price.toFixed(2) ?? "—"}
              </div>
              <div className="agro-metric-unit">NPR / KG</div>
            </div>
          </div>
          <div className="agro-metric-card">
            <div className="agro-metric-ico agro-ico-blue">
              <ChartLine size={22} />
            </div>
            <div className="agro-metric-body">
              <div className="agro-metric-label">Avg Predicted (7d)</div>
              <div className="agro-metric-val">{avgPred7 != null ? `Rs. ${avgPred7.toFixed(2)}` : "—"}</div>
              <div className="agro-metric-unit">NPR / KG</div>
            </div>
          </div>
          <div className="agro-metric-card">
            <div className={`agro-metric-ico ${trendUp ? "agro-ico-red" : "agro-ico-muted"}`}>
              {trendUp ? <TrendingUp size={22} /> : <TrendingDown size={22} />}
            </div>
            <div className="agro-metric-body">
              <div className="agro-metric-label">Price Trend</div>
              <div className={`agro-metric-trend ${trendUp ? "up" : ""}`}>{trendLabel}</div>
            </div>
          </div>
          <div className="agro-metric-card">
            <div className="agro-metric-ico agro-ico-amber">
              <Lightbulb size={22} />
            </div>
            <div className="agro-metric-body">
              <div className="agro-metric-label">Recommendation</div>
              {rec && <span className={`agro-rec-pill ${rec.className}`}>{rec.text}</span>}
            </div>
          </div>
        </div>

        {dash && (
          <div className="agro-two-col">
            <div className="agro-col-left">
              <DecisionSupportPanel
                dash={dash}
                role={viewRole}
                dieselChangePct={null}
              />
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

            <aside className="agro-sidebar">
              <div className="agro-card agro-mini-card">
                <h3 className="agro-mini-title">
                  <span className="agro-mini-ico">🌡️</span> Weather — Kathmandu
                  <span className="agro-live-badge">Live</span>
                </h3>
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
                  <p className="muted-agro">No weather data for latest date.</p>
                )}
              </div>
              <div className="agro-card agro-mini-card">
                <h3 className="agro-mini-title">
                  <Fuel size={18} strokeWidth={2} /> NOC Fuel Prices
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
                      <div className="agro-fuel-pill" style={{ background: "#dbeafe", color: "#1e40af" }}>
                        <span>Kerosene</span>
                        <strong>Rs. {dash.fuel.kerosene_price.toFixed(0)}</strong>
                      </div>
                    )}
                    {dash.fuel.lpg_price != null && (
                      <div className="agro-fuel-pill" style={{ background: "#ede9fe", color: "#5b21b6" }}>
                        <span>LPG/cyl</span>
                        <strong>Rs. {dash.fuel.lpg_price.toFixed(0)}</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="muted-agro">No fuel data — run pipeline to refresh.</p>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>

      <footer className="agro-footer">
        AgroPredict Nepal | Agricultural Price Prediction System | Final Year CSIT Project
      </footer>
    </div>
  );
}
