import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchDashboard,
  fetchFeaturedCrops,
  fetchSevenDay,
  fetchThirtyDay,
  type DashboardPayload,
  type ForecastPayload,
} from "../services/api";
import { useAuth } from "../auth/AuthContext";

const TT: React.CSSProperties = {
  background: "#1e293b",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 13,
};

function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function SectionHeader({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="cp-section-head">
      <h2 className="cp-section-title">{label}</h2>
      {sub && <p className="muted-agro cp-section-sub">{sub}</p>}
    </div>
  );
}

export default function ChartsPage() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<string[]>([]);
  const [item, setItem] = useState(searchParams.get("item") ?? "");
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [f7, setF7] = useState<ForecastPayload | null>(null);
  const [f30, setF30] = useState<ForecastPayload | null>(null);
  const [historyWindow, setHistoryWindow] = useState<7 | 30>(30);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const viewRole = role ?? "buyer";

  useEffect(() => {
    void fetchFeaturedCrops()
      .then((r) => {
        setItems(r.items);
        setItem((prev) => {
          if (prev && r.items.includes(prev)) return prev;
          const fromUrl = searchParams.get("item");
          if (fromUrl && r.items.includes(fromUrl)) return fromUrl;
          return r.items[0] ?? "";
        });
      })
      .catch((e: Error) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!item) return;
    const ac = new AbortController();
    let cancelled = false;
    setSearchParams({ item }, { replace: true });
    setLoading(true);
    setErr(null);
    void Promise.all([
      fetchDashboard(item, ac.signal),
      fetchSevenDay(item, ac.signal).catch(() => null),
      fetchThirtyDay(item, ac.signal).catch(() => null),
    ])
      .then(([d, seven, thirty]) => {
        if (cancelled) return;
        setDash(d as DashboardPayload);
        setF7(seven as ForecastPayload | null);
        setF30(thirty as ForecastPayload | null);
        setLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled || e.name === "AbortError") return;
        setErr(e.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [item]);

  const chart7 = useMemo(
    () => (f7?.points ?? []).map((p) => ({ day: p.target_date ? fmtDay(p.target_date) : "", price: p.predicted_price })),
    [f7]
  );

  const hist30 = useMemo(() => (dash?.historical_30d ?? []), [dash?.historical_30d]);

  const chart30 = useMemo(
    () => (f30?.points ?? []).map((p) => ({ day: p.target_date ? fmtDay(p.target_date) : "", price: p.predicted_price })),
    [f30]
  );

  const historyBars = useMemo(() => {
    const history = hist30.slice(-historyWindow);
    if (!history.length) return [];
    return history.map((row, idx) => {
      const prev = idx > 0 ? history[idx - 1].avg_price : row.avg_price;
      const changed = row.avg_price - prev;
      return {
        label: fmtDay(row.date),
        price: row.avg_price,
        // Red when price decreased, green when increased.
        fill: changed < 0 ? "#dc2626" : changed > 0 ? "#16a34a" : "#94a3b8",
        movement: changed < 0 ? "Decreased" : changed > 0 ? "Increased" : "No change",
      };
    });
  }, [hist30, historyWindow]);

  const weather14 = useMemo(() => dash?.weather_14d ?? [], [dash?.weather_14d]);
  const fuel14 = useMemo(() => dash?.fuel_14d ?? [], [dash?.fuel_14d]);

  const weatherChartData = useMemo(
    () => weather14.map((w) => ({ day: fmtDay(w.date), temp: w.temperature, rain: w.rainfall, humid: w.humidity })),
    [weather14]
  );

  const fuelChartData = useMemo(
    () => fuel14.map((f) => ({ day: fmtDay(f.date), petrol: f.petrol_price, diesel: f.diesel_price })),
    [fuel14]
  );

  return (
    <div className="agro-app">
      {/* Header with back + crop selector */}
      <header className="agro-header-main">
        <div className="agro-header-inner">
          <div className="agro-brand-row">
            <button
              type="button"
              className="agro-btn-ghost"
              onClick={() => navigate("/dashboard")}
              style={{ marginRight: 12, color: "#fff", borderColor: "rgba(255,255,255,0.3)" }}
            >
              &larr; Back
            </button>
            <span className="agro-logo-dot" aria-hidden />
            <div>
              <div className="agro-brand-title">Price Charts</div>
              <div className="agro-brand-tagline">Detailed analysis &middot; {viewRole === "buyer" ? "7-day forecast" : "30-day history"}</div>
            </div>
          </div>
          <div className="agro-header-actions">
            <div className="agro-crop-select-wrap" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <label className="agro-crop-label" htmlFor="cp-select" style={{ color: "rgba(255,255,255,0.7)", whiteSpace: "nowrap" }}>
                Commodity:
              </label>
              <select
                id="cp-select"
                className="agro-select"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                style={{ minWidth: 160, fontWeight: 600 }}
              >
                {items.map((i) => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="agro-main">
        {err && <div className="agro-banner agro-banner-err" role="alert">{err}</div>}
        {loading && <div className="agro-banner" role="status">Loading charts for {item}…</div>}

        {/* ── SECTION 1: MAIN PRICE CHART ─────────────────────── */}
        <div className="agro-card cp-card">
          <SectionHeader
            label={viewRole === "buyer" ? `7-Day Price Forecast — ${item}` : `30-Day Price History — ${item}`}
            sub={viewRole === "buyer" ? "RandomForest ML model · Kalimati Market" : "Actual market data · Kalimati Market"}
          />

          {viewRole === "buyer" ? (
            chart7.length === 0 ? (
              <p className="muted-agro cp-empty">Run the pipeline to generate a 7-day forecast.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chart7} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cp7d" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3A86FF" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3A86FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#d1d5db" }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} label={{ value: "NPR/KG", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => [`Rs. ${v.toFixed(2)}`, "Predicted"]} />
                  <Area type="monotone" dataKey="price" stroke="#3A86FF" strokeWidth={2.5} fill="url(#cp7d)" dot={{ r: 5, fill: "#3A86FF", strokeWidth: 0 }} activeDot={{ r: 7 }} />
                </AreaChart>
              </ResponsiveContainer>
            )
          ) : (
            hist30.length === 0 ? (
              <p className="muted-agro cp-empty">No historical data available.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart
                  data={hist30.map((r) => ({ label: fmtDay(r.date), price: r.avg_price }))}
                  margin={{ top: 8, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                  <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} interval={Math.ceil(hist30.length / 10)} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} label={{ value: "NPR/KG", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }} />
                  <Tooltip contentStyle={TT} formatter={(v: number) => [`Rs. ${v.toFixed(2)}`, "Avg"]} />
                  <Line type="monotone" dataKey="price" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )
          )}
        </div>

        {/* ── SECTION 2: CROP PRICE HISTORY BARS (7/30 days) ── */}
        {historyBars.length > 0 && (
          <div className="agro-card cp-card">
            <SectionHeader
              label={`Crop Price History Bar Chart — ${item}`}
              sub="Choose 7 or 30 days. Red = price decreased vs previous day, green = increased."
            />
            <div className="reports-filter-group" style={{ marginBottom: "0.75rem" }}>
              <button
                type="button"
                className={`reports-filter-btn ${historyWindow === 7 ? "active" : ""}`}
                onClick={() => setHistoryWindow(7)}
              >
                Last 7 Days
              </button>
              <button
                type="button"
                className={`reports-filter-btn ${historyWindow === 30 ? "active" : ""}`}
                onClick={() => setHistoryWindow(30)}
              >
                Last 30 Days
              </button>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={historyBars} margin={{ top: 8, right: 16, left: 4, bottom: 4 }} barCategoryGap="12%">
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} interval={historyWindow === 7 ? 0 : 2} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={TT}
                  formatter={(v: number, _n: string, payload: { payload?: { movement?: string } }) => [
                    `Rs. ${v.toFixed(2)}${payload?.payload?.movement ? ` (${payload.payload.movement})` : ""}`,
                    "Avg",
                  ]}
                />
                <Bar dataKey="price" radius={[3, 3, 0, 0]}>
                  {historyBars.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}


        {/* ── SECTION 3: 30-DAY TREND OUTLOOK (buyer only) ─── */}
        {viewRole === "buyer" && chart30.length > 0 && (
          <div className="agro-card cp-card">
            <SectionHeader
              label={`30-Day Trend Outlook — ${item}`}
              sub="Long-horizon trend projection · ML model"
            />
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chart30} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 10 }} interval={4} />
                <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} />
                <Tooltip contentStyle={TT} formatter={(v: number) => [`Rs. ${v.toFixed(2)}`, "Forecast"]} />
                <Line type="monotone" dataKey="price" stroke="#f59e0b" strokeWidth={2.5} dot={false} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── SECTION 4: RECENT CROP PRICES TABLE ─────────── */}
        {(dash?.historical_30d ?? []).length > 0 && (
          <div className="agro-card cp-card">
            <SectionHeader
              label={`Recent Prices — ${item}`}
              sub="Last 10 days · Kalimati Market actual prices (NPR/KG)"
            />
            <div style={{ overflowX: "auto" }}>
              <table className="agro-data-table" style={{ width: "100%" }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Min Price</th>
                    <th>Avg Price</th>
                    <th>Max Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(dash?.historical_30d ?? []).slice(-10).reverse().map((row, i) => (
                    <tr key={i}>
                      <td>{fmtDay(row.date)}</td>
                      <td>Rs. {row.min_price.toFixed(0)}</td>
                      <td style={{ fontWeight: 600 }}>Rs. {row.avg_price.toFixed(0)}</td>
                      <td>Rs. {row.max_price.toFixed(0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── SECTION 6: WEATHER 14 DAYS ───────────────────── */}
        {weatherChartData.length > 0 && (
          <div className="agro-card cp-card">
            <SectionHeader
              label="Weather — Kathmandu (22 May to 2 June)"
              sub="Temperature, precipitation, and humidity affecting crop prices"
            />
            <div className="cp-weather-row">
              {/* Temperature + Rainfall chart */}
              <div style={{ flex: 2 }}>
                <p className="muted-agro" style={{ fontSize: "0.8rem", marginBottom: 6 }}>Temperature (°C) & Rainfall (mm)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={weatherChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                    <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 10 }} interval={2} />
                    <YAxis yAxisId="temp" tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <YAxis yAxisId="rain" orientation="right" tick={{ fill: "#6b7280", fontSize: 10 }} />
                    <Tooltip contentStyle={TT} formatter={(v: number, name: string) => [name === "temp" ? `${v.toFixed(1)} °C` : `${v.toFixed(2)} mm`, name === "temp" ? "Temp" : "Rain"]} />
                    <Line yAxisId="temp" type="monotone" dataKey="temp" stroke="#ef4444" strokeWidth={2} dot={false} name="temp" />
                    <Line yAxisId="rain" type="monotone" dataKey="rain" stroke="#3b82f6" strokeWidth={2} dot={false} name="rain" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Weather table */}
              <div style={{ flex: 1, overflowX: "auto" }}>
                <p className="muted-agro" style={{ fontSize: "0.8rem", marginBottom: 6 }}>Daily readings (all available days)</p>
                <table className="agro-data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Temp</th>
                      <th>Rain</th>
                      <th>Humid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...weather14].reverse().map((w, i) => (
                      <tr key={i}>
                        <td>{fmtDay(w.date)}</td>
                        <td>{w.temperature.toFixed(1)} °C</td>
                        <td>{w.rainfall.toFixed(2)} mm</td>
                        <td>{w.humidity.toFixed(0)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── SECTION 7: FUEL PRICES 14 DAYS ──────────────── */}
        {fuelChartData.length > 0 && (
          <div className="agro-card cp-card">
            <SectionHeader
              label="NOC Fuel Prices — 22 May to 2 June"
              sub="Diesel prices directly affect transport costs and crop prices"
            />
            <div className="cp-weather-row">
              <div style={{ flex: 2 }}>
                <p className="muted-agro" style={{ fontSize: "0.8rem", marginBottom: 6 }}>Petrol & Diesel (NPR/litre)</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={fuelChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                    <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 10 }} interval={2} />
                    <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={TT} formatter={(v: number, name: string) => [`Rs. ${v.toFixed(0)}`, name === "petrol" ? "Petrol" : "Diesel"]} />
                    <Line type="monotone" dataKey="petrol" stroke="#ef4444" strokeWidth={2} dot={false} name="petrol" />
                    <Line type="monotone" dataKey="diesel" stroke="#f59e0b" strokeWidth={2} dot={false} name="diesel" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ flex: 1, overflowX: "auto" }}>
                <p className="muted-agro" style={{ fontSize: "0.8rem", marginBottom: 6 }}>Daily fuel prices (all available days)</p>
                <table className="agro-data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Petrol</th>
                      <th>Diesel</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...fuel14].reverse().map((f, i) => (
                      <tr key={i}>
                        <td>{fmtDay(f.date)}</td>
                        <td>Rs. {f.petrol_price.toFixed(0)}</td>
                        <td>Rs. {f.diesel_price.toFixed(0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="cp-legend">
              <span><span className="cp-dot" style={{ background: "#ef4444" }} /> Petrol</span>
              <span><span className="cp-dot" style={{ background: "#f59e0b" }} /> Diesel</span>
            </div>
          </div>
        )}
      </main>

      <footer className="agro-footer">
        AgroPredict Nepal &nbsp;·&nbsp; Kalimati Market Data
      </footer>
    </div>
  );
}
