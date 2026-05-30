import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/AuthContext";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Register from "./pages/Register";
import NotificationsPage from "./pages/NotificationsPage";
import FuelPricePage from "./pages/FuelPricePage";
import ReportsPage from "./pages/ReportsPage";
import ChartsPage from "./pages/ChartsPage";
import CropPreferencesPage from "./pages/CropPreferencesPage";
import { PipelineProvider, usePipeline } from "./contexts/PipelineContext";
import { PipelineProgressModal } from "./components/agro/PipelineProgressModal";

function PrivateRoute({ children }: { children: React.ReactElement }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function GlobalPipelineSidebar() {
  const { pipeUi, dismissPipeline, toggleMinimize } = usePipeline();
  return (
    <PipelineProgressModal
      open={pipeUi.open}
      minimized={pipeUi.minimized}
      phase={pipeUi.phase}
      commodityLabel={pipeUi.commodity}
      errorMessage={pipeUi.error}
      successMessage={pipeUi.success}
      elapsedSeconds={pipeUi.elapsedTick}
      onDismiss={dismissPipeline}
      onToggleMinimize={toggleMinimize}
    />
  );
}

export default function App() {
  return (
    <PipelineProvider>
      <div className="ambient" aria-hidden />
      <GlobalPipelineSidebar />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <PrivateRoute>
              <NotificationsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/fuel-prices"
          element={
            <PrivateRoute>
              <FuelPricePage />
            </PrivateRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <PrivateRoute>
              <ReportsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/charts"
          element={
            <PrivateRoute>
              <ChartsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/crop-preferences"
          element={
            <PrivateRoute>
              <CropPreferencesPage />
            </PrivateRoute>
          }
        />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </PipelineProvider>
  );
}
