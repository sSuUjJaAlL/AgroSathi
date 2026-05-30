import type { DashboardPayload } from "../services/api";

export function AccuracyTable({ rows }: { rows: DashboardPayload["accuracy_table"] }) {
  return (
    <div className="card">
      <h2>Prediction accuracy & explanation</h2>
      <p className="muted card-sub">
        Validation accuracy comes from held-out history (MAPE → %). Reasons summarize merge quality and volatile
        drivers feeding the RandomForest.
      </p>
      <div style={{ overflowX: "auto" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Accuracy (%)</th>
              <th>Confidence</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item}>
                <td>{r.item}</td>
                <td className="mono-stat">{r.accuracy_pct != null ? r.accuracy_pct.toFixed(2) : "—"}</td>
                <td>{r.confidence}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
