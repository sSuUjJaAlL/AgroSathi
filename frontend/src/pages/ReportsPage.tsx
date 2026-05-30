import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, TrendingUp, TrendingDown, Minus, BarChart2, RefreshCw } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { fetchCropSnapshot, fetchFeaturedCrops } from "../services/api";

type SnapRow = { item_name: string; min_price: number; max_price: number; avg_price: number; date: string };

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function priceRange(row: SnapRow) {
  return `Rs. ${row.min_price.toFixed(0)} – ${row.max_price.toFixed(0)}`;
}

export default function ReportsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SnapRow[]>([]);
  const [featured, setFeatured] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "featured">("featured");
  const [sortBy, setSortBy] = useState<"name" | "price_asc" | "price_desc">("name");

  function reload() {
    setLoading(true);
    setErr(null);
    Promise.all([fetchCropSnapshot(), fetchFeaturedCrops()])
      .then(([snap, feat]) => {
        setRows(snap);
        setFeatured(new Set(feat.items));
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, []);

  const displayed = rows
    .filter((r) => filter === "all" || featured.has(r.item_name))
    .sort((a, b) => {
      if (sortBy === "price_asc") return a.avg_price - b.avg_price;
      if (sortBy === "price_desc") return b.avg_price - a.avg_price;
      return a.item_name.localeCompare(b.item_name);
    });

  const avgMarket = displayed.length
    ? displayed.reduce((s, r) => s + r.avg_price, 0) / displayed.length
    : 0;

  return (
    <div className="agro-app">
      <header className="agro-header-main">
        <div className="agro-header-inner">
          <div className="agro-brand-row">
            <span className="agro-logo-dot" aria-hidden />
            <span className="agro-brand-title">AgroPredict Nepal</span>
          </div>
          <div className="agro-header-actions">
            <button type="button" className="agro-btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.3)" }} onClick={() => navigate("/dashboard")}>
              <ArrowLeft size={15} style={{ marginRight: 4 }} />
              Dashboard
            </button>
            <button type="button" className="agro-logout-btn" onClick={logout} style={{ borderColor: "rgba(255,255,255,0.3)", color: "#fff" }}>
              Logout
            </button>
          </div>
        </div>
      </header>
      <div className="agro-header-sub">
        <div className="agro-header-sub-inner">
          <div className="agro-status-chips">
            <span className="agro-chip"><BarChart2 size={14} /> Market Overview — Kalimati Prices</span>
          </div>
        </div>
      </div>

      <main className="agro-main">
        {/* Summary strip */}
        <div className="reports-summary-strip">
          <div className="reports-summary-card">
            <div className="agro-summary-label">Commodities shown</div>
            <div className="agro-summary-val agro-sum-green">{displayed.length}</div>
          </div>
          <div className="reports-summary-card">
            <div className="agro-summary-label">Avg market price</div>
            <div className="agro-summary-val agro-sum-blue">Rs. {avgMarket.toFixed(0)}</div>
            <div className="agro-summary-sub">NPR / KG</div>
          </div>
          <div className="reports-summary-card">
            <div className="agro-summary-label">Highest price</div>
            <div className="agro-summary-val agro-sum-amber">
              {displayed.length ? `Rs. ${Math.max(...displayed.map(r => r.avg_price)).toFixed(0)}` : "—"}
            </div>
          </div>
          <div className="reports-summary-card">
            <div className="agro-summary-label">Lowest price</div>
            <div className="agro-summary-val agro-sum-green">
              {displayed.length ? `Rs. ${Math.min(...displayed.map(r => r.avg_price)).toFixed(0)}` : "—"}
            </div>
          </div>
        </div>

        <div className="agro-card" style={{ marginBottom: "1.25rem" }}>
          {/* Controls */}
          <div className="reports-controls">
            <div className="reports-filter-group">
              <button
                type="button"
                className={`reports-filter-btn ${filter === "featured" ? "active" : ""}`}
                onClick={() => setFilter("featured")}
              >
                Featured Crops
              </button>
              <button
                type="button"
                className={`reports-filter-btn ${filter === "all" ? "active" : ""}`}
                onClick={() => setFilter("all")}
              >
                All Commodities
              </button>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <label className="agro-select-label" style={{ whiteSpace: "nowrap" }}>Sort by</label>
              <select
                className="agro-select"
                style={{ maxWidth: 180 }}
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              >
                <option value="name">Name A–Z</option>
                <option value="price_desc">Price High → Low</option>
                <option value="price_asc">Price Low → High</option>
              </select>
              <button type="button" className="agro-btn-ghost" onClick={reload} title="Refresh">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {err && <div className="agro-banner agro-banner-err" style={{ margin: "0.75rem 0 0" }}>{err}</div>}

          {loading ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "#64748b" }}>Loading market data…</div>
          ) : displayed.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "#94a3b8" }}>No commodity data. Run the pipeline to populate prices.</div>
          ) : (
            <div className="agro-model-table-wrap" style={{ marginTop: "1rem" }}>
              <table className="agro-table reports-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Commodity</th>
                    <th>Current Price (NPR/KG)</th>
                    <th>Price Range</th>
                    <th>vs Avg</th>
                    <th>As of Date</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {displayed.map((r, i) => {
                    const vsAvg = avgMarket > 0 ? ((r.avg_price - avgMarket) / avgMarket) * 100 : 0;
                    return (
                      <tr key={r.item_name} className="reports-row">
                        <td className="muted-agro" style={{ fontSize: "0.82rem" }}>{i + 1}</td>
                        <td>
                          <span className="agro-veg-cell">
                            {featured.has(r.item_name) && (
                              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#2d6a4f", display: "inline-block", flexShrink: 0 }} title="Featured crop" />
                            )}
                            {r.item_name}
                          </span>
                        </td>
                        <td>
                          <strong style={{ fontFamily: "var(--display)", fontSize: "1.05rem" }}>
                            Rs. {r.avg_price.toFixed(2)}
                          </strong>
                        </td>
                        <td className="muted-agro" style={{ fontSize: "0.85rem" }}>{priceRange(r)}</td>
                        <td>
                          <span className={`reports-vs-avg ${vsAvg > 5 ? "high" : vsAvg < -5 ? "low" : "mid"}`}>
                            {vsAvg > 0.5 ? <TrendingUp size={13} /> : vsAvg < -0.5 ? <TrendingDown size={13} /> : <Minus size={13} />}
                            {vsAvg > 0 ? "+" : ""}{vsAvg.toFixed(1)}%
                          </span>
                        </td>
                        <td className="muted-agro" style={{ fontSize: "0.82rem" }}>{formatDate(r.date)}</td>
                        <td>
                          <button
                            type="button"
                            className="agro-btn-ghost"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.65rem" }}
                            onClick={() => navigate("/dashboard")}
                          >
                            Analyse →
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <footer className="agro-footer">
        AgroPredict Nepal | Agricultural Price Prediction System | Final Year CSIT Project
      </footer>
    </div>
  );
}
