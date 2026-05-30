import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Check, Loader2 } from "lucide-react";
import { fetchFeaturedCrops, getCropPreferences, setCropPreferences } from "../services/api";

export default function CropPreferencesPage() {
  const navigate = useNavigate();
  const [crops, setCrops] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchFeaturedCrops(), getCropPreferences()])
      .then(([{ items }, { cropPreferences }]) => {
        setCrops(items);
        setSelected(new Set(cropPreferences));
        setLoading(false);
      })
      .catch((e: Error) => {
        setErr(e.message);
        setLoading(false);
      });
  }, []);

  function toggle(crop: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(crop)) next.delete(crop);
      else next.add(crop);
      return next;
    });
    setSaved(false);
  }

  function selectAll() {
    setSelected(new Set(crops));
    setSaved(false);
  }

  function clearAll() {
    setSelected(new Set());
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await setCropPreferences(Array.from(selected));
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

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
            <span className="agro-brand-title">Crop Alert Preferences</span>
          </div>
        </div>
      </header>

      <main className="agro-main">
        <div className="agro-card" style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <Bell size={22} className="agro-card-ico" />
            <h2 className="agro-card-title" style={{ margin: 0 }}>Select Crops for Daily Alerts</h2>
          </div>
          <p className="muted-agro" style={{ marginBottom: 20 }}>
            You will receive email notifications only for the crops you select. Leave all unchecked to receive alerts for all crops.
          </p>

          {err && (
            <div className="agro-banner agro-banner-err" role="alert" style={{ marginBottom: 16 }}>{err}</div>
          )}

          {loading ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#6b7280", padding: "24px 0" }}>
              <Loader2 size={18} className="agro-pipeline-spinner" />
              Loading crops…
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <button type="button" className="agro-btn-ghost" style={{ fontSize: 13 }} onClick={selectAll}>
                  Select All
                </button>
                <button type="button" className="agro-btn-ghost" style={{ fontSize: 13 }} onClick={clearAll}>
                  Clear All
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
                {crops.map((crop) => {
                  const isOn = selected.has(crop);
                  return (
                    <button
                      key={crop}
                      type="button"
                      onClick={() => toggle(crop)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                        borderRadius: 10,
                        border: isOn ? "2px solid #2d6a4f" : "2px solid #e5e7eb",
                        background: isOn ? "#ecfdf5" : "#fff",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: 14,
                        color: isOn ? "#1b4332" : "#374151",
                        textAlign: "left",
                        transition: "all 0.15s",
                      }}
                    >
                      <span
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: isOn ? "none" : "2px solid #d1d5db",
                          background: isOn ? "#2d6a4f" : "transparent",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {isOn && <Check size={13} color="#fff" strokeWidth={3} />}
                      </span>
                      {crop}
                    </button>
                  );
                })}
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  type="button"
                  className="agro-btn-pipeline"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  style={{ minWidth: 120 }}
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="agro-pipeline-spinner" /> Saving…
                    </>
                  ) : (
                    "Save Preferences"
                  )}
                </button>
                {saved && (
                  <span style={{ color: "#2d6a4f", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
                    <Check size={16} /> Saved!
                  </span>
                )}
              </div>

              {selected.size === 0 && (
                <p className="muted-agro" style={{ marginTop: 12, fontSize: 13 }}>
                  No crops selected — you will receive alerts for all crops.
                </p>
              )}
              {selected.size > 0 && (
                <p className="muted-agro" style={{ marginTop: 12, fontSize: 13 }}>
                  {selected.size} crop{selected.size !== 1 ? "s" : ""} selected: {Array.from(selected).join(", ")}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="agro-footer">
        AgroPredict Nepal | Agricultural Price Prediction System | Final Year CSIT Project
      </footer>
    </div>
  );
}
