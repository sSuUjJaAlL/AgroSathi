import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, Calendar, LineChart as LineChartIcon, Search } from "lucide-react";
import {
  fetchDashboard,
  fetchFeaturedCrops,
  fetchMultiAlgoForecast,
  fetchSevenDay,
  fetchThirtyDay,
  type DashboardPayload,
  type ForecastPayload,
} from "../services/api";

const BAR_RED = "#E57373";
const BAR_GREEN = "#2D6A4F";
const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#374151",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 13,
};

function formatDayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type MultiAlgo = {
  random_forest: Array<{ target_date: string | null; predicted_price: number }>;
  moving_average: Array<{ target_date: string | null; predicted_price: number }>;
  lstm: Array<{ target_date: string | null; predicted_price: number }>;
} | null;

export default function ChartsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<string[]>([]);
  const [item, setItem] = useState(searchParams.get("item") ?? "");
  const [dash, setDash] = useState<DashboardPayload | null>(null);
  const [f7, setF7] = useState<ForecastPayload | null>(null);
  const [f30, setF30] = useState<ForecastPayload | null>(null);
  const [multiAlgo, setMultiAlgo] = useState<MultiAlgo>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    setSearchParams({ item }, { replace: true });
    setLoading(true);
    setErr(null);
    void Promise.all([
      fetchDashboard(item),
      fetchSevenDay(item).catch(() => null),
      fetchThirtyDay(item).catch(() => null),
      fetchMultiAlgoForecast(item, "7d").catch(() => null),
    ])
      .then(([d, seven, thirty, multi]) => {
        setDash(d as DashboardPayload);
        setF7(seven as ForecastPayload | null);
        setF30(thirty as ForecastPayload | null);
        if (multi) setMultiAlgo(multi as MultiAlgo);
        setLoading(false);
      })
      .catch((e: Error) => {
        setErr(e.message);
        setLoading(false);
      });
  }, [item]);

  const chart7 = useMemo(
    () =>
      (f7?.points || []).map((p) => ({
        day: p.target_date ? formatDayLabel(p.target_date) : "",
        price: p.predicted_price,
      })),
    [f7]
  );

  const hist30 = useMemo(() => {
    const h = dash?.historical_30d ?? [];
    return h.map((row) => ({
      label: formatDayLabel(row.date),
      price: row.avg_price,
    }));
  }, [dash?.historical_30d]);

  const multiAlgoChart = useMemo(() => {
    if (!multiAlgo) return [];
    const len = Math.max(
      multiAlgo.random_forest.length,
      multiAlgo.moving_average.length,
      multiAlgo.lstm.length
    );
    return Array.from({ length: len }, (_, i) => {
      const rfPt = multiAlgo.random_forest[i];
      const dayLabel = rfPt?.target_date
        ? formatDayLabel(rfPt.target_date)
        : multiAlgo.lstm[i]?.target_date
        ? formatDayLabel(multiAlgo.lstm[i].target_date!)
        : `D${i + 1}`;
      return {
        day: dayLabel,
        rf: multiAlgo.random_forest[i]?.predicted_price ?? null,
        ma: multiAlgo.moving_average[i]?.predicted_price ?? null,
        lstm: multiAlgo.lstm[i]?.predicted_price ?? null,
      };
    });
  }, [multiAlgo]);

  const farmerBars = useMemo(() => {
    const h = dash?.historical_30d ?? [];
    if (!h.length) return [];
    const prices = h.map((x) => x.avg_price);
    const sorted = [...prices].sort((a, b) => a - b);
    const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
    return h.map((row) => ({
      label: formatDayLabel(row.date),
      price: row.avg_price,
      fill: row.avg_price >= mid ? BAR_RED : BAR_GREEN,
    }));
  }, [dash?.historical_30d]);

  const chart30 = useMemo(
    () =>
      (f30?.points || []).map((p) => ({
        day: p.target_date ? formatDayLabel(p.target_date) : "",
        price: p.predicted_price,
      })),
    [f30]
  );

  return (
    <div className="agro-app">
      <header className="agro-header-main">
        <div className="agro-header-inner">
          <div className="agro-brand-row">
            <button
              type="button"
              className="agro-btn-ghost"
              onClick={() => navigate("/dashboard")}
              style={{ marginRight: 12 }}
              aria-label="Back to dashboard"
            >
              <ArrowLeft size={18} />
            </button>
            <span className="agro-logo-dot" aria-hidden />
            <span className="agro-brand-title">Price Charts</span>
          </div>
          <div className="agro-header-actions">
            <div className="agro-select-block" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Search size={15} />
              <select
                className="agro-select"
                value={item}
                onChange={(e) => setItem(e.target.value)}
                style={{ minWidth: 160 }}
              >
                {items.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </header>

      <main className="agro-main">
        {err && (
          <div className="agro-banner agro-banner-err" role="alert">{err}</div>
        )}
        {loading && (
          <div className="agro-banner" role="status">Loading charts for {item}…</div>
        )}

        {/* 7-Day Price Prediction */}
        <section className="agro-card agro-chart-card">
          <div className="agro-card-head">
            <LineChartIcon size={20} className="agro-card-ico" />
            <h2 className="agro-card-title">7-Day Price Prediction</h2>
            <span className="agro-tag-blue">7-Day Forecast</span>
          </div>
          <div className="agro-chart-area">
            {chart7.length === 0 ? (
              <p className="muted-agro agro-empty-txt">Run the pipeline to generate a 7-day forecast.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chart7} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="predFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4CC9F0" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#4CC9F0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={{ stroke: "#d1d5db" }} />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={{ stroke: "#d1d5db" }}
                    domain={["auto", "auto"]}
                    label={{ value: "Price (NPR / KG)", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`NPR ${v.toFixed(2)} / KG`, "Predicted"]} />
                  <Legend
                    verticalAlign="top"
                    align="center"
                    formatter={() => <span style={{ color: "#374151", fontSize: 13 }}>Predicted Price (NPR/KG)</span>}
                    iconType="circle"
                    iconSize={10}
                  />
                  <Area
                    type="monotone"
                    dataKey="price"
                    name="Predicted Price (NPR/KG)"
                    stroke="#3A86FF"
                    strokeWidth={2}
                    fill="url(#predFill)"
                    dot={{ r: 4, fill: "#3A86FF", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* Historical 30-Day */}
        <section className="agro-card agro-chart-card">
          <div className="agro-card-head agro-card-head-divider">
            <Calendar size={20} className="agro-card-ico" strokeWidth={2} />
            <h2 className="agro-card-title">Historical Prices — Last 30 Days</h2>
          </div>
          <div className="agro-bar-legend">
            <span className="agro-dot-red" />
            <span>Actual Price (NPR/KG)</span>
          </div>
          <div className="agro-chart-area">
            {hist30.length === 0 ? (
              <p className="muted-agro agro-empty-txt">No historical rows for this commodity yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hist30} margin={{ top: 8, right: 12, left: 4, bottom: 4 }} barCategoryGap="18%">
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} interval={Math.ceil(hist30.length / 12)} axisLine={{ stroke: "#d1d5db" }} />
                  <YAxis
                    tick={{ fill: "#6b7280", fontSize: 11 }}
                    axisLine={{ stroke: "#d1d5db" }}
                    domain={[(min: number) => Math.floor(min / 10) * 10 - 10, (max: number) => Math.ceil(max / 10) * 10 + 10]}
                    label={{ value: "Price (NPR / KG)", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v: number) => [`NPR ${Number(v).toFixed(2)} / KG`, ""]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as { label?: string } | undefined;
                      return p?.label ?? "";
                    }}
                  />
                  <Bar dataKey="price" fill={BAR_RED} radius={[4, 4, 0, 0]} name="Actual" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* 3-Algorithm Overlay */}
        {multiAlgoChart.length > 0 && (
          <section className="agro-card agro-chart-card">
            <div className="agro-card-head">
              <LineChartIcon size={20} className="agro-card-ico" />
              <h2 className="agro-card-title">7-Day Forecast — All 3 Algorithms</h2>
            </div>
            <div className="agro-chart-area">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={multiAlgoChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} label={{ value: "NPR/KG", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 10 }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`Rs. ${v.toFixed(2)}`, ""]} />
                  <Legend />
                  <Line type="monotone" dataKey="ma" stroke="#9ca3af" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Moving Average" connectNulls />
                  <Line type="monotone" dataKey="rf" stroke="#3A86FF" strokeWidth={2} dot={{ r: 4, fill: "#3A86FF", strokeWidth: 0 }} name="RandomForest" connectNulls />
                  <Line type="monotone" dataKey="lstm" stroke="#10b981" strokeWidth={2} dot={{ r: 4, fill: "#10b981", strokeWidth: 0 }} name="LSTM" connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Farmer Baseline Bar Chart */}
        <section className="agro-card agro-chart-card">
          <div className="agro-card-head">
            <LineChartIcon size={20} />
            <h2 className="agro-card-title">Daily Prices vs Market Baseline (Last 30 Days)</h2>
          </div>
          <p className="muted-agro agro-farmer-hint">
            Red bars: at or above median · Green bars: below median (relative supply pressure).
          </p>
          <div className="agro-chart-area">
            {farmerBars.length === 0 ? (
              <p className="muted-agro agro-empty-txt">No historical prices for this commodity.</p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={farmerBars} margin={{ top: 8, right: 12, left: 4, bottom: 4 }} barCategoryGap="12%">
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`Rs. ${v.toFixed(2)}`, "Avg"]} />
                  <Bar dataKey="price" radius={[3, 3, 0, 0]}>
                    {farmerBars.map((entry, i) => (
                      <Cell key={`c-${i}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        {/* 30-Day Trend Outlook */}
        <section className="agro-card agro-chart-card">
          <div className="agro-card-head">
            <LineChartIcon size={20} />
            <h2 className="agro-card-title">30-Day Price Trend Outlook</h2>
          </div>
          <div className="agro-chart-area">
            {chart30.length === 0 ? (
              <p className="muted-agro agro-empty-txt">Run ML to populate the 30-day horizon.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={chart30} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                  <XAxis dataKey="day" tick={{ fill: "#6b7280", fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Line type="monotone" dataKey="price" stroke="#f59e0b" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </main>

      <footer className="agro-footer">
        AgroPredict Nepal | Agricultural Price Prediction System | Final Year CSIT Project
      </footer>
    </div>
  );
}
