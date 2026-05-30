import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { fetchSevenDay, runPipeline } from "../services/api";
import type { PipelineModalPhase } from "../components/agro/PipelineProgressModal";

interface PipelineState {
  open: boolean;
  minimized: boolean;
  phase: PipelineModalPhase;
  commodity: string;
  error?: string | null;
  success?: string | null;
  elapsedTick: number;
  refreshTick: number;
}

interface PipelineCtxValue {
  pipeUi: PipelineState;
  pipelineBusy: boolean;
  startPipeline: (item: string, prevBatchId: string | null) => void;
  dismissPipeline: () => void;
  toggleMinimize: () => void;
}

const PipelineCtx = createContext<PipelineCtxValue | null>(null);

const IDLE: PipelineState = {
  open: false,
  minimized: false,
  phase: "idle",
  commodity: "",
  elapsedTick: 0,
  refreshTick: 0,
};

export function PipelineProvider({ children }: { children: React.ReactNode }) {
  const [pipeUi, setPipeUi] = useState<PipelineState>(IDLE);
  const runningRef = useRef(false);

  const pipelineBusy = pipeUi.open && pipeUi.phase !== "success" && pipeUi.phase !== "error";

  useEffect(() => {
    const active =
      pipeUi.open &&
      (pipeUi.phase === "starting" ||
        pipeUi.phase === "preprocess" ||
        pipeUi.phase === "analyze" ||
        pipeUi.phase === "finalize");
    if (!active) return;
    const id = window.setInterval(() => {
      setPipeUi((u) => ({ ...u, elapsedTick: u.elapsedTick + 1 }));
    }, 1000);
    return () => window.clearInterval(id);
  }, [pipeUi.open, pipeUi.phase]);

  const dismissPipeline = useCallback(() => {
    setPipeUi((u) => ({ ...IDLE, refreshTick: u.refreshTick }));
    runningRef.current = false;
  }, []);

  const toggleMinimize = useCallback(() => {
    setPipeUi((u) => ({ ...u, minimized: !u.minimized }));
  }, []);

  const startPipeline = useCallback(
    async (item: string, prevBatchId: string | null) => {
      if (runningRef.current) return;
      runningRef.current = true;

      setPipeUi((u) => ({
        ...IDLE,
        open: true,
        phase: "starting",
        commodity: item,
        refreshTick: u.refreshTick,
      }));

      try {
        await runPipeline();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Pipeline request failed.";
        setPipeUi((u) => ({ ...u, phase: "error", error: msg }));
        runningRef.current = false;
        return;
      }

      const start = Date.now();
      const maxMs = 6 * 60 * 1000;

      const inferPhase = (elapsed: number): PipelineModalPhase => {
        if (elapsed < 8000) return "preprocess";
        if (elapsed < 90000) return "analyze";
        return "finalize";
      };

      setPipeUi((u) => ({ ...u, phase: "preprocess" }));

      while (runningRef.current && Date.now() - start < maxMs) {
        const elapsed = Date.now() - start;
        setPipeUi((u) => ({ ...u, phase: inferPhase(elapsed) }));

        try {
          const seven = await fetchSevenDay(item).catch(() => null);
          const points = seven?.points?.length ?? 0;
          const newBatch = seven?.batch_id ?? null;
          const batchChanged = newBatch != null && newBatch !== prevBatchId;
          const ready = points > 0 && (prevBatchId === null || batchChanged);

          if (ready) {
            const avg =
              points > 0
                ? seven!.points!.reduce((s, p) => s + p.predicted_price, 0) / points
                : 0;
            setPipeUi((u) => ({
              ...u,
              phase: "success",
              minimized: false,
              success: `Forecasts updated for "${item}". Avg next 7 days: Rs. ${avg.toFixed(2)}/kg.`,
              refreshTick: u.refreshTick + 1,
            }));
            runningRef.current = false;
            return;
          }
        } catch {
          /* continue polling */
        }

        await new Promise((r) => setTimeout(r, 2500));
      }

      if (runningRef.current) {
        setPipeUi((u) => ({
          ...u,
          phase: "error",
          error: "No new forecast within 6 minutes. Check backend and ML service logs.",
        }));
      }
      runningRef.current = false;
    },
    []
  );

  return (
    <PipelineCtx.Provider value={{ pipeUi, pipelineBusy, startPipeline, dismissPipeline, toggleMinimize }}>
      {children}
    </PipelineCtx.Provider>
  );
}

export function usePipeline(): PipelineCtxValue {
  const ctx = useContext(PipelineCtx);
  if (!ctx) throw new Error("usePipeline must be used within PipelineProvider");
  return ctx;
}
