import { useEffect, useState, useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Fuel, TrendingUp, TrendingDown, Minus, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchFuelLatest, fetchFuelHistory, fetchFuelImpact, fetchFeaturedCrops } from "../services/api";

const FUEL_COLORS: Record<string, string> = {
  petrol: "#ef4444",
  diesel: "#f59e0b",
  kerosene: "#3b82f6",
  lpg: "#8b5cf6",
};

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "#374151",
  border: "none",
  borderRadius: 8,
  color: "#fff",
  fontSize: 13,
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function PriceCard({ label, value, unit }: { label: string; value: number | null; unit: string }) {
  return (
    <div className="agro-metric-card">
      <div className="agro-metric-ico agro-ico-amber">
        <Fuel size={22} />
      </div>
      <div className="agro-metric-body">
        <div className="agro-metric-label">{label}</div>
        <div className="agro-metric-val">{value != null ? `Rs. ${value.toFixed(0)}` : "—"}</div>
        <div className="agro-metric-unit">{unit}</div>
      </div>
    </div>
  );
}

export default function FuelPricePage() {
  const navigate = useNavigate();
  const [latest, setLatest] = useState<{ date: string; petrol: number | null; diesel: number | null; kerosene: number | null; lpg: number | null } | null>(null);
  const [history, setHistory] = useState<Array<{ date: string; fuel_type: string; price_npr: number }>>([]);
  const [impacts, setImpacts] = useState<Array<{ crop: string; correlation: number; interpretation: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const fromStr = oneYearAgo.toISOString().slice(0, 10);

    void Promise.all([
      fetchFuelLatest(),
      fetchFuelHistory(fromStr),
      fetchFeaturedCrops(),
    ])
      .then(([lat, hist, featured]) => {
        setLatest(lat);
        setHistory(hist.fuel);
        // fetch correlation for all featured crops
        return Promise.all(featured.items.map((crop) => fetchFuelImpact(crop).catch(() => null)));
      })
      .then((results) => {
        setImpacts(results.filter(Boolean) as typeof impacts);
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Pivot history into { date, petrol, diesel, kerosene, lpg } rows for chart
  const chartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number>>();
    for (const row of history) {
      const d = row.date.slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, {});
      byDate.get(d)![row.fuel_type] = row.price_npr;
    }
    return Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date: fmt(date), ...vals }));
  }, [history]);

  return (
    <div className="agro-app">
      <header className="agro-header" style={{ padding: "1rem 1.5rem" }}>
        <button className="agro-btn-ghost" onClick={() => navigate("/dashboard")} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ArrowLeft size={16} /> Dashboard
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Fuel size={22} />
          <span style={{ fontWeight: 700, fontSize: "1.1rem" }}>NOC Fuel Prices — Nepal</span>
        </div>
        <span className="muted-agro" style={{ fontSize: 13 }}>
          {latest ? `Last updated: ${fmt(latest.date)}` : ""}
        </span>
      </header>

      <main className="agro-main">
        {err && (
          <div className="agro-banner agro-banner-err" role="alert">
            {err}
          </div>
        )}

        {loading ? (
          <p className="muted-agro" style={{ padding: "2rem" }}>Loading fuel data…</p>
        ) : (
          <>
            {/* Current price cards */}
            <div className="agro-metrics">
              <PriceCard label="Petrol" value={latest?.petrol ?? null} unit="NPR / Liter" />
              <PriceCard label="Diesel" value={latest?.diesel ?? null} unit="NPR / Liter" />
              <PriceCard label="Kerosene" value={latest?.kerosene ?? null} unit="NPR / Liter" />
              <PriceCard label="LPG Cylinder" value={latest?.lpg ?? null} unit="NPR / 14.2kg" />
            </div>

            {/* Historical chart */}
            <section className="agro-card agro-chart-card">
              <div className="agro-card-head">
                <Fuel size={20} className="agro-card-ico" />
                <h2 className="agro-card-title">Fuel Price History — Last 12 Months</h2>
              </div>
              {chartData.length === 0 ? (
                <p className="muted-agro agro-empty-txt">
                  No fuel price history. Run: <code>cd backend &amp;&amp; npm run seed:fuel</code>
                </p>
              ) : (
                <div className="agro-chart-area">
                  <ResponsiveContainer width="100%" height={320}>
                    <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" />
                      <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} interval={Math.ceil(chartData.length / 12)} />
                      <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} domain={["auto", "auto"]} label={{ value: "NPR", angle: -90, position: "insideLeft", fill: "#6b7280", fontSize: 11 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`Rs. ${v}`, ""]} />
                      <Legend />
                      <Line type="stepAfter" dataKey="petrol" stroke={FUEL_COLORS.petrol} strokeWidth={2} dot={false} name="Petrol (NPR/L)" />
                      <Line type="stepAfter" dataKey="diesel" stroke={FUEL_COLORS.diesel} strokeWidth={2} dot={false} name="Diesel (NPR/L)" />
                      <Line type="stepAfter" dataKey="kerosene" stroke={FUEL_COLORS.kerosene} strokeWidth={2} dot={false} name="Kerosene (NPR/L)" />
                      <Line type="stepAfter" dataKey="lpg" stroke={FUEL_COLORS.lpg} strokeWidth={2} dot={false} name="LPG (NPR/cylinder)" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>

            {/* Fuel → crop correlation */}
            <section className="agro-card">
              <div className="agro-card-head">
                <h2 className="agro-card-title">How Diesel Price Affects Crop Prices</h2>
              </div>
              <p className="muted-agro" style={{ marginBottom: "1rem" }}>
                Pearson correlation between diesel price and historical avg price for each featured crop.
                Positive correlation → diesel rises, crop price tends to rise (transport cost pass-through).
              </p>
              {impacts.length === 0 ? (
                <p className="muted-agro">No correlation data — run pipeline first.</p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "0.75rem" }}>
                  {impacts
                    .sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation))
                    .map((imp) => {
                      const pct = Math.round(imp.correlation * 100);
                      const isPos = imp.correlation > 0;
                      const isStrong = Math.abs(imp.correlation) > 0.5;
                      return (
                        <div key={imp.crop} className="agro-card agro-mini-card" style={{ margin: 0 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <strong style={{ fontSize: 14 }}>{imp.crop}</strong>
                            <span style={{ display: "flex", alignItems: "center", gap: 4, color: isPos ? "#ef4444" : "#3b82f6", fontWeight: 700 }}>
                              {isPos ? <TrendingUp size={15} /> : imp.correlation < 0 ? <TrendingDown size={15} /> : <Minus size={15} />}
                              {pct > 0 ? "+" : ""}{pct}%
                            </span>
                          </div>
                          <p className="muted-agro" style={{ margin: "0.25rem 0 0", fontSize: 12 }}>{imp.interpretation}</p>
                          <div style={{ height: 4, borderRadius: 2, background: "#e5e7eb", marginTop: 8 }}>
                            <div style={{ width: `${Math.min(Math.abs(pct), 100)}%`, height: "100%", borderRadius: 2, background: isStrong ? (isPos ? "#ef4444" : "#3b82f6") : "#9ca3af" }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </section>

            {/* Explainer */}
            <section className="agro-card" style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
              <h3 style={{ color: "#166534", marginBottom: "0.5rem" }}>Why Diesel Matters for Crop Prices</h3>
              <p style={{ color: "#166534", lineHeight: 1.6, margin: 0 }}>
                Nepal imports almost all petroleum from India. Diesel powers trucks that carry vegetables from
                Kalimati market to retailers. When diesel rises 10%, transport costs rise 8–12%, which typically
                passes through to perishable vegetables within <strong>10–14 days</strong>. Our LSTM model is
                specifically trained to detect this lag relationship from 5+ years of data.
              </p>
            </section>
          </>
        )}
      </main>

      <footer className="agro-footer">
        AgroPredict Nepal | Fuel Price Analysis | Sources: NOC press releases
      </footer>
    </div>
  );
}
