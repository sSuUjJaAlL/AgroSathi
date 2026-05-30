import type { DashboardPayload } from "../services/api";

export function WeatherPanel({ weather }: { weather: DashboardPayload["weather"] }) {
  if (!weather) {
    return (
      <div className="card">
        <h2>Weather context</h2>
        <p className="muted card-sub">No weather rows in database — seed historical data first.</p>
      </div>
    );
  }
  return (
    <div className="card">
      <h2>Weather panel</h2>
      <p className="muted card-sub">Daily features merged into the price dataset.</p>
      <ul className="muted" style={{ paddingLeft: "1.1rem", margin: "0.25rem 0 0" }}>
        <li>
          Temperature: <span className="mono-stat">{weather.temperature}</span> °C
        </li>
        <li>
          Rainfall: <span className="mono-stat">{weather.rainfall}</span> mm
        </li>
        <li>
          Humidity: <span className="mono-stat">{weather.humidity}</span>%
        </li>
      </ul>
      <p className="muted" style={{ marginBottom: 0 }}>
        Latest: {new Date(weather.date).toLocaleDateString()}
      </p>
    </div>
  );
}
