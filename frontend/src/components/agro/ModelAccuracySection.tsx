import { Target } from "lucide-react";
import type { DashboardPayload } from "../../services/api";
import { accuracyBand, bandVisual } from "../../utils/accuracyMeta";
import { veggieIcon } from "../../utils/vegIcon";

const MAX_ROWS = 8;

export function ModelAccuracySection({
  vegetable_model_accuracy,
  accuracy_summary,
}: Pick<DashboardPayload, "vegetable_model_accuracy" | "accuracy_summary">) {
  const computed =
    accuracy_summary.computed_at != null
      ? new Date(accuracy_summary.computed_at).toLocaleDateString("en-US", {
          month: "numeric",
          day: "numeric",
          year: "numeric",
        })
      : "—";

  const rows = (vegetable_model_accuracy ?? []).slice(0, MAX_ROWS);

  return (
    <section className="agro-card agro-model-card">
      <div className="agro-model-head">
        <h2 className="agro-model-title">
          <Target size={22} className="agro-model-target" aria-hidden />
          Model Accuracy — Per Vegetable
        </h2>
        <span className="agro-date-badge">{computed}</span>
      </div>

      <div className="agro-summary-strip">
        <div>
          <div className="agro-summary-label">Overall accuracy</div>
          <div className="agro-summary-val agro-sum-green">
            {accuracy_summary.overall_accuracy_pct != null
              ? `${accuracy_summary.overall_accuracy_pct.toFixed(2)}%`
              : "—"}
          </div>
        </div>
        <div>
          <div className="agro-summary-label">Avg price error</div>
          <div className="agro-summary-val agro-sum-blue">
            {accuracy_summary.avg_price_error_npr != null
              ? `Rs. ${accuracy_summary.avg_price_error_npr.toFixed(2)}`
              : "—"}
          </div>
          <div className="agro-summary-sub">per KG</div>
        </div>
        <div>
          <div className="agro-summary-label">Avg % error</div>
          <div className="agro-summary-val agro-sum-amber">
            {accuracy_summary.avg_pct_error != null ? `${accuracy_summary.avg_pct_error.toFixed(2)}%` : "—"}
          </div>
        </div>
        <div>
          <div className="agro-summary-label">Records used</div>
          <div className="agro-summary-val agro-sum-blue">{accuracy_summary.records_used?.toLocaleString() ?? "—"}</div>
        </div>
      </div>

      <div className="agro-model-table-wrap">
        <table className="agro-table">
          <thead>
            <tr>
              <th>Vegetable</th>
              <th>Accuracy Level</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={2} className="agro-table-empty">
                  Run the data pipeline and ML training to populate per-crop validation scores.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const band = accuracyBand(r.accuracy_pct);
                const vis = bandVisual(band);
                const pct = r.accuracy_pct ?? 0;
                return (
                  <tr key={r.item}>
                    <td>
                      <span className="agro-veg-cell">
                        <span className="agro-veg-ico">{veggieIcon(r.item)}</span>
                        {r.item}
                      </span>
                    </td>
                    <td>
                      <div className="agro-acc-cell">
                        <div className="agro-progress-track">
                          <div
                            className="agro-progress-fill"
                            style={{ width: `${Math.min(100, pct)}%`, background: vis.bar }}
                          />
                        </div>
                        <span className="agro-acc-pct mono">{pct.toFixed(2)}%</span>
                        <span className="agro-band-pill" style={{ background: vis.badgeBg, color: vis.badgeText }}>
                          {band}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
