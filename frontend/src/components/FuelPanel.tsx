import type { DashboardPayload } from "../services/api";

export function FuelPanel({ fuel }: { fuel: DashboardPayload["fuel"] }) {
  if (!fuel) {
    return (
      <div className="card">
        <h2>Fuel prices</h2>
        <p className="muted card-sub">No fuel rows in database — seed historical data first.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h2>Fuel panel</h2>
      <p className="muted card-sub">Petrol & diesel series used as logistics pressure proxies.</p>
      <ul className="muted" style={{ paddingLeft: "1.1rem", margin: "0.25rem 0 0" }}>
        <li>
          Petrol: <span className="mono-stat">Rs. {fuel.petrol_price.toFixed(2)}</span>
        </li>
        <li>
          Diesel: <span className="mono-stat">Rs. {fuel.diesel_price.toFixed(2)}</span>
        </li>
      </ul>
      <p className="muted" style={{ marginBottom: 0 }}>
        Latest: {new Date(fuel.date).toLocaleDateString()}
      </p>
    </div>
  );
}
