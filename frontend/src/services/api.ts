const TOKEN_KEY = "agri_jwt";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function parseErrorBody(text: string, status: number): string {
  const t = text.trim();
  if (!t) {
    if (status === 502 || status === 503 || status === 504) {
      return "API unavailable — is the backend running on port 4000 with MongoDB up?";
    }
    if (status === 401) return "Unauthorized — please sign in again.";
    return `Request failed (${status})`;
  }
  try {
    const j = JSON.parse(t) as { message?: string };
    if (j.message && typeof j.message === "string") return j.message;
  } catch {
    /* plain text */
  }
  if (t.length > 280) return `${t.slice(0, 280)}…`;
  return t;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(init?.headers || {}),
  };
  const token = getToken();
  if (token) {
    (headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }

  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    throw new Error("Network error — check that the backend is running (port 4000) and MongoDB is reachable.");
  }

  const text = await res.text();
  if (!res.ok) {
    throw new Error(parseErrorBody(text, res.status));
  }
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid JSON from server");
  }
}

export type Role = "farmer" | "buyer";

export async function login(email: string, password: string) {
  return request<{ token: string; user: { email: string; role: Role } }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string, role: Role) {
  return request<{ token: string; user: { email: string; role: Role } }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, role }),
  });
}

export async function fetchMe() {
  return request<{ email: string; role: Role }>("/api/auth/me");
}

export async function getCropPreferences() {
  return request<{ cropPreferences: string[] }>("/api/auth/preferences");
}

export async function setCropPreferences(cropPreferences: string[]) {
  return request<{ ok: boolean; cropPreferences: string[] }>("/api/auth/preferences", {
    method: "PUT",
    body: JSON.stringify({ cropPreferences }),
  });
}

export async function fetchItems() {
  return request<{ items: string[] }>("/api/crop/items");
}

/** Top N commodities by number of historical price rows (Kalimati dataset coverage). */
export async function fetchTopCommodities(limit = 10) {
  return request<{ items: string[]; limit: number }>(`/api/crop/items/top?limit=${limit}`);
}

const emptySummary: DashboardPayload["accuracy_summary"] = {
  overall_accuracy_pct: null,
  avg_pct_error: null,
  avg_price_error_npr: null,
  records_used: 0,
  computed_at: null,
};

export async function fetchDashboard(item: string): Promise<DashboardPayload> {
  const q = encodeURIComponent(item);
  const d = await request<DashboardPayload>(`/api/dashboard/${q}`);
  return {
    ...d,
    historical_30d: d.historical_30d ?? [],
    weather_14d: d.weather_14d ?? [],
    fuel_14d: d.fuel_14d ?? [],
    vegetable_model_accuracy: d.vegetable_model_accuracy ?? [],
    accuracy_summary: d.accuracy_summary ?? emptySummary,
  };
}

export async function fetchSevenDay(item: string) {
  const q = encodeURIComponent(item);
  return request<ForecastPayload>(`/api/predict/7days/${q}`);
}

export async function fetchThirtyDay(item: string) {
  const q = encodeURIComponent(item);
  return request<ForecastPayload>(`/api/predict/30days/${q}`);
}

export async function runPipeline() {
  return request<{ ok: boolean; message: string }>("/api/pipeline/run", { method: "POST", body: "{}" });
}

export async function fetchNotifications(page = 1, limit = 20, direction?: "DROP" | "RISE", unreadOnly = false) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (direction) params.set("direction", direction);
  if (unreadOnly) params.set("unread", "true");
  return request<{
    notifications: import("../hooks/useNotifications").AppNotification[];
    total: number;
    page: number;
    pages: number;
  }>(`/api/notifications?${params}`);
}

export async function fetchUnreadCount() {
  return request<{ count: number }>("/api/notifications/unread-count");
}

export async function markNotificationRead(id: string) {
  return request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead() {
  return request<{ ok: boolean }>("/api/notifications/read-all", { method: "PATCH" });
}

export async function fetchFeaturedCrops() {
  return request<{ items: string[] }>("/api/crop/featured");
}

export async function fetchCropSnapshot() {
  return request<Array<{ item_name: string; min_price: number; max_price: number; avg_price: number; date: string }>>(
    "/api/crop/snapshot"
  );
}

export async function fetchFuelLatest() {
  return request<{ date: string; petrol: number | null; diesel: number | null; kerosene: number | null; lpg: number | null }>(
    "/api/data/fuel/latest"
  );
}

export async function fetchFuelHistory(from?: string, to?: string, type?: string) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (type) params.set("type", type);
  const qs = params.toString();
  return request<{ fuel: Array<{ date: string; fuel_type: string; price_npr: number; source: string }> }>(
    `/api/data/fuel${qs ? `?${qs}` : ""}`
  );
}

export async function fetchFuelImpact(crop: string) {
  return request<{ crop: string; correlation: number; interpretation: string }>(
    `/api/data/fuel/impact/${encodeURIComponent(crop)}`
  );
}

export async function fetchMultiAlgoForecast(item: string, horizon: "7d" | "30d" = "7d") {
  return request<{
    item: string;
    horizon: string;
    random_forest: Array<{ target_date: string | null; predicted_price: number }>;
    moving_average: Array<{ target_date: string | null; predicted_price: number }>;
    lstm: Array<{ target_date: string | null; predicted_price: number }>;
  }>(`/api/predict/multi/${encodeURIComponent(item)}?horizon=${horizon}`);
}

export async function triggerLstmTrain() {
  return request<{ ok: boolean; message: string }>("/api/pipeline/train-lstm", { method: "POST", body: "{}" });
}

export interface DashboardPayload {
  item: string;
  current_price: {
    avg_price: number;
    min_price: number;
    max_price: number;
    date: string;
  } | null;
  weather: {
    date: string;
    temperature: number;
    rainfall: number;
    humidity: number;
  } | null;
  fuel: {
    date: string;
    petrol_price: number;
    diesel_price: number;
    kerosene_price?: number | null;
    lpg_price?: number | null;
  } | null;
  recommendation: "BUY_EARLY_OR_HOLD" | "SELL" | "WAIT";
  recommendation_detail: { logic: string };
  accuracy_table: Array<{ item: string; accuracy_pct: number | null; confidence: string; reason: string }>;
  trend_30d: string;
  historical_30d: Array<{ date: string; avg_price: number; min_price: number; max_price: number }>;
  weather_14d: Array<{ date: string; temperature: number; rainfall: number; humidity: number }>;
  fuel_14d: Array<{ date: string; petrol_price: number; diesel_price: number; kerosene_price?: number | null; lpg_price?: number | null }>;
  vegetable_model_accuracy: Array<{ item: string; accuracy_pct: number | null; confidence: string; reason: string }>;
  accuracy_summary: {
    overall_accuracy_pct: number | null;
    avg_pct_error: number | null;
    avg_price_error_npr: number | null;
    records_used: number;
    computed_at: string | null;
  };
}

export interface ForecastPayload {
  item: string;
  horizon: string;
  batch_id: string | null;
  points: Array<{
    target_date: string | null;
    predicted_price: number;
    trend?: string;
    accuracy?: number;
    confidence?: string;
    reason?: string;
  }>;
  summary: {
    trend?: string;
    accuracy?: number;
    confidence?: string;
    reason?: string;
  } | null;
}
