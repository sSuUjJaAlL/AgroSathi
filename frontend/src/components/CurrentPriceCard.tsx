import type { DashboardPayload } from "../services/api";

export function CurrentPriceCard({ data }: { data: DashboardPayload["current_price"] }) {
  if (!data) {
    return (
      <div className="card">
        <h2>Current Kalimati snapshot</h2>
        <p className="muted card-sub">No price row for this item yet. Run the scraper after seeding MongoDB.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h2>Spot average</h2>
      <p className="muted card-sub">Latest merged mandi average for this commodity.</p>
      <div className="price-hero mono-stat">Rs. {data.avg_price.toFixed(2)}</div>
      <p className="muted">
        Min <span className="mono-stat">Rs. {data.min_price.toFixed(2)}</span> · Max{" "}
        <span className="mono-stat">Rs. {data.max_price.toFixed(2)}</span>
      </p>
      <p className="muted" style={{ marginBottom: 0 }}>
        As of {new Date(data.date).toLocaleDateString()}
      </p>
    </div>
  );
}
