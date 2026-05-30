import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Sparkles, Leaf, Minus } from "lucide-react";

export type PipelineModalPhase =
  | "idle"
  | "starting"
  | "preprocess"
  | "analyze"
  | "finalize"
  | "success"
  | "error";

const STEPS = [
  { key: "preprocess", title: "Preprocessing", detail: "Scraping prices, syncing weather, merging features for ML." },
  { key: "analyze", title: "Analyzing & training", detail: "Training Random Forest on historical Kalimati data (may take 1–3 min)." },
  { key: "finalize", title: "Finalizing results", detail: "Writing 7-day & 30-day forecasts and accuracy scores to the database." },
] as const;

const NEPAL_FACTS = [
  "Nepal produces over 3 million tonnes of vegetables annually — mostly from Terai and Hill districts.",
  "Kalimati Market in Kathmandu is Nepal's largest wholesale agri market, established in 1990.",
  "Tomatoes and potatoes are Nepal's most traded vegetables by volume at Kalimati.",
  "Monsoon season (June–September) heavily influences prices due to flooding on major supply routes.",
  "Nepal is one of Asia's top ginger exporters — Palpa, Syangja, and Pokhara are the main growing areas.",
  "Diesel price changes shift Terai-grown produce prices within 10–14 days via transport cost pressure.",
  "Kathmandu Valley imports ~60% of its vegetables from Terai plains via the Hetauda–Mugling highway.",
"The ML model learns from 5+ years of Kalimati records across all 10 featured commodities.",
  "Rice (Chamal) is Nepal's staple — grown in Terai lowlands and consumed across all 77 districts.",
  "Onion prices in Nepal are closely linked to Indian import policy; supply disruptions spike prices fast.",
  "Garlic cultivation is expanding in mid-hills to reduce dependence on Chinese imports.",
  "Wheat is primarily grown in the Terai belt — harvest season (March–April) brings peak supply and lower prices.",
  "Green chilli grows year-round in Terai, but quality and volume peak October–December.",
  "Cauliflower is a winter crop in Nepal — prices typically halve between November and January.",
];

function getProgressPct(elapsedSeconds: number, phase: PipelineModalPhase): number {
  if (phase === "starting") return 4;
  if (phase === "success") return 100;
  if (phase === "error") return 0;
  if (phase === "preprocess") return Math.min(14, 4 + elapsedSeconds * 1.2);
  if (phase === "analyze") {
    const into = Math.max(0, elapsedSeconds - 8);
    return Math.min(82, 15 + into * 0.75);
  }
  if (phase === "finalize") {
    const into = Math.max(0, elapsedSeconds - 90);
    return Math.min(96, 83 + into * 0.15);
  }
  return 0;
}

export function PipelineProgressModal({
  open,
  minimized,
  phase,
  commodityLabel,
  errorMessage,
  successMessage,
  elapsedSeconds,
  onDismiss,
  onToggleMinimize,
}: {
  open: boolean;
  minimized?: boolean;
  phase: PipelineModalPhase;
  commodityLabel: string;
  errorMessage?: string | null;
  successMessage?: string | null;
  elapsedSeconds: number;
  onDismiss: () => void;
  onToggleMinimize?: () => void;
}) {
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    if (phase === "success" || phase === "error" || phase === "idle") return;
    const id = window.setInterval(() => {
      setFactIndex((n) => (n + 1) % NEPAL_FACTS.length);
    }, 5000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (open) setFactIndex(Math.floor(Math.random() * NEPAL_FACTS.length));
  }, [open]);

  if (!open) return null;

  const running = phase !== "idle" && phase !== "success" && phase !== "error";

  if (minimized) {
    return (
      <div className="agro-pipeline-pill" role="status" aria-label="Pipeline running">
        <Loader2 size={14} className="agro-pipeline-spinner" aria-hidden />
        <span>Pipeline running — <strong>{commodityLabel}</strong></span>
        <span className="agro-pipeline-pill-time">
          {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")}
        </span>
        <button type="button" className="agro-pipeline-pill-expand" onClick={onToggleMinimize} aria-label="Expand pipeline panel">
          ▲
        </button>
      </div>
    );
  }
  const progressPct = getProgressPct(elapsedSeconds, phase);

  const stepIndex =
    phase === "starting"
      ? 0
      : phase === "preprocess"
        ? 0
        : phase === "analyze"
          ? 1
          : phase === "finalize"
            ? 2
            : phase === "success"
              ? 3
              : -1;

  return (
    <div className="agro-pipeline-sidebar-wrap" role="complementary" aria-labelledby="pipeline-modal-title">
      <div className="agro-pipeline-sidebar">
        {running && (
          <div className="agro-pipeline-progress-bar-track" aria-hidden>
            <div
              className="agro-pipeline-progress-bar-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        <div className="agro-pipeline-modal-head">
          {running && onToggleMinimize && (
            <button
              type="button"
              className="agro-pipeline-minimize-btn"
              onClick={onToggleMinimize}
              aria-label="Minimize pipeline panel"
              title="Minimize — pipeline keeps running"
            >
              <Minus size={16} strokeWidth={2.5} />
            </button>
          )}
          <h2 id="pipeline-modal-title" className="agro-pipeline-modal-title">
            {phase === "success" ? (
              <>
                <Sparkles size={22} className="agro-pipeline-icon-success" aria-hidden />
                Pipeline complete
              </>
            ) : phase === "error" ? (
              <>
                <AlertCircle size={22} className="agro-pipeline-icon-error" aria-hidden />
                Pipeline issue
              </>
            ) : (
              <>
                <Loader2 size={22} className="agro-pipeline-spinner" aria-hidden />
                Running data pipeline
              </>
            )}
          </h2>
          <p className="agro-pipeline-modal-sub">
            Commodity: <strong>{commodityLabel || "—"}</strong>
            {running && (
              <span className="agro-pipeline-elapsed">
                &nbsp;· {Math.floor(elapsedSeconds / 60)}:{String(elapsedSeconds % 60).padStart(2, "0")} elapsed
              </span>
            )}
          </p>
        </div>

        {phase !== "error" && phase !== "success" && (
          <ol className="agro-pipeline-steps">
            {STEPS.map((s, i) => {
              const done = stepIndex > i;
              const active = stepIndex === i;
              return (
                <li key={s.key} className={`agro-pipeline-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
                  <div className="agro-pipeline-step-marker">
                    {done ? <CheckCircle2 size={20} strokeWidth={2.5} aria-hidden /> : active ? <Loader2 size={20} className="agro-pipeline-spinner" aria-hidden /> : <span className="agro-pipeline-step-num">{i + 1}</span>}
                  </div>
                  <div>
                    <div className="agro-pipeline-step-title">{s.title}</div>
                    <div className="agro-pipeline-step-detail">{s.detail}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        {phase === "starting" && <p className="agro-pipeline-status-msg">Sending request to the server…</p>}

        {running && (
          <div className="agro-pipeline-fact">
            <span className="agro-pipeline-fact-icon"><Leaf size={14} aria-hidden /></span>
            <span className="agro-pipeline-fact-text">{NEPAL_FACTS[factIndex]}</span>
          </div>
        )}

        {phase === "success" && successMessage && <p className="agro-pipeline-result agro-pipeline-result-success">{successMessage}</p>}

        {phase === "error" && errorMessage && <p className="agro-pipeline-result agro-pipeline-result-error">{errorMessage}</p>}

        {(phase === "success" || phase === "error") && (
          <button type="button" className="agro-pipeline-dismiss" onClick={onDismiss}>
            {phase === "success" ? "View dashboard" : "Close"}
          </button>
        )}
      </div>
    </div>
  );
}

