import axios, { type AxiosInstance } from "axios";
import * as cheerio from "cheerio";
import {
  KALIMATI_OFFICIAL_TARGETS,
  resolveOfficialCommodityId,
  assertAllTargetsResolvable,
  type KalimatiOfficialTarget,
} from "../config/kalimatiOfficialTargets.js";
import { COMMODITY_NEPALI, type SelectedCrop } from "../config/selectedCrops.js";
import { scrapeKalimatiPrices } from "./kalimati.scraper.js";

export const KALIMATI_PRICE_HISTORY_URL = "https://kalimatimarket.gov.np/price-history";
export const KALIMATI_PRICE_HISTORY_API = "https://kalimatimarket.gov.np/api/price-history";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function cookieHeaderFromSetCookie(setCookie: string[] | undefined): string {
  if (!setCookie?.length) return "";
  return setCookie.map((c) => c.split(";")[0]?.trim()).filter(Boolean).join("; ");
}

function applyKalimatiSession(client: AxiosInstance, sessionCookie: string): void {
  if (!sessionCookie) return;
  client.defaults.headers.common.Cookie = sessionCookie;
  client.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest";
}

export type OfficialPriceRow = {
  date: Date;
  commodityEnglish: SelectedCrop;
  commodityNepali: string;
  minimumPrice: number;
  maximumPrice: number;
  averagePrice: number;
  unit: string;
  generated: false;
  source: string;
};

type ChartJson = {
  commodity?: string;
  prices?: {
    date?: string[];
    min?: Array<number | string | null>;
    max?: Array<number | string | null>;
    avg?: Array<number | string | null>;
  };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * MS_PER_DAY);
}

function normalizeDate(raw: string): Date | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const dot = t.match(/^(\d{4})\.(\d{2})\.(\d{2})/);
  if (dot) return new Date(`${dot[1]}-${dot[2]}-${dot[3]}T12:00:00.000Z`);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00.000Z`);
  const slash = t.match(/^(\d{4})\/(\d{2})\/(\d{2})/);
  if (slash) return new Date(`${slash[1]}-${slash[2]}-${slash[3]}T12:00:00.000Z`);
  return null;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number.parseFloat(v.replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function withKalimatiRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 25
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const retryable = status === 429 || (status != null && status >= 500);
      if (!retryable || attempt === maxAttempts) throw error;
      const waitMs = Math.min(90_000, 3_000 * attempt);
      console.log(`[Kalimati API] ${label} HTTP ${status} — wait ${Math.round(waitMs / 1000)}s (${attempt}/${maxAttempts})`);
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw new Error(`Retry exhausted: ${label}`);
}

export function createKalimatiClient(): AxiosInstance {
  return axios.create({
    timeout: 60_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Referer: KALIMATI_PRICE_HISTORY_URL,
      Accept: "application/json,text/plain,*/*",
    },
  });
}

export async function discoverKalimatiCommodityIds(client: AxiosInstance): Promise<{
  token: string;
  labelToId: Map<string, string>;
  sessionCookie: string;
}> {
  const { data: html, headers } = await withKalimatiRetry("price-history page", () =>
    client.get<string>(KALIMATI_PRICE_HISTORY_URL)
  );
  const sessionCookie = cookieHeaderFromSetCookie(headers["set-cookie"]);
  applyKalimatiSession(client, sessionCookie);

  const $ = cheerio.load(html);
  const token = $('input[name="_token"]').attr("value")?.trim() ?? "";
  if (!token) throw new Error("Kalimati CSRF token not found on /price-history");

  const labelToId = new Map<string, string>();
  $("#commodity_selector option").each((_i, opt) => {
    const value = $(opt).attr("value")?.trim();
    const label = $(opt).text().trim();
    if (value && label && !label.includes("कृषि उपजको नाम")) {
      labelToId.set(label, value);
    }
  });

  assertAllTargetsResolvable(labelToId);
  return { token, labelToId, sessionCookie };
}

async function fetchHistoryChunk(
  client: AxiosInstance,
  token: string,
  commodityId: string,
  from: Date,
  to: Date
): Promise<ChartJson> {
  const params = new URLSearchParams({
    locale: "en",
    _token: token,
    from: isoDate(from),
    to: isoDate(to),
  });
  const { data } = await withKalimatiRetry(
    `POST /api/price-history/${commodityId} ${isoDate(from)}..${isoDate(to)}`,
    () =>
      client.post<ChartJson>(`${KALIMATI_PRICE_HISTORY_API}/${commodityId}`, params.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
      })
  );
  return data ?? {};
}

export async function fetchOfficialHistoryForTarget(
  client: AxiosInstance,
  token: string,
  labelToId: Map<string, string>,
  target: KalimatiOfficialTarget,
  from: Date,
  to: Date,
  opts?: { chunkDays?: number; delayMs?: number }
): Promise<OfficialPriceRow[]> {
  const resolved = resolveOfficialCommodityId(labelToId, target);
  if (!resolved) {
    console.warn(`[Kalimati API] Skip ${target.commodityEnglish}: no commodity id`);
    return [];
  }

  const chunkDays = opts?.chunkDays ?? 89;
  const delayMs = opts?.delayMs ?? 2_000;
  const byDate = new Map<string, OfficialPriceRow>();
  let cursor = new Date(from);
  let chunks = 0;

  console.log(
    `[Kalimati API] ${target.commodityEnglish} id=${resolved.id} label="${resolved.matchedLabel}" ${isoDate(from)}..${isoDate(to)}`
  );

  while (cursor <= to) {
    const chunkEnd = addDays(cursor, chunkDays - 1);
    const sliceEnd = chunkEnd < to ? chunkEnd : to;
    const payload = await fetchHistoryChunk(client, token, resolved.id, cursor, sliceEnd);
    const dates = payload.prices?.date ?? [];
    const mins = payload.prices?.min ?? [];
    const maxes = payload.prices?.max ?? [];
    const avgs = payload.prices?.avg ?? [];

    for (let i = 0; i < dates.length; i++) {
      const date = normalizeDate(String(dates[i] ?? ""));
      const avg = toNum(avgs[i]);
      if (!date || avg == null) continue;
      const min = toNum(mins[i]) ?? avg;
      const max = toNum(maxes[i]) ?? avg;
      const key = isoDate(date);
      byDate.set(key, {
        date,
        commodityEnglish: target.commodityEnglish,
        commodityNepali: COMMODITY_NEPALI[target.commodityEnglish],
        minimumPrice: Math.min(min, max),
        maximumPrice: Math.max(min, max),
        averagePrice: avg,
        unit: "Kg",
        generated: false,
        source: "kalimatimarket.gov.np/api/price-history",
      });
    }

    chunks++;
    if (chunks % 5 === 0) {
      console.log(`[Kalimati API] ${target.commodityEnglish}: ${chunks} chunks, ${byDate.size} days so far`);
    }

    cursor = addDays(sliceEnd, 1);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  return [...byDate.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Merge today's live bulletin table (official /price HTML) over API rows for same date. */
export async function mergeTodayLiveBulletin(rows: OfficialPriceRow[]): Promise<OfficialPriceRow[]> {
  const { rows: live } = await scrapeKalimatiPrices();
  if (!live.length) return rows;

  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const todayKey = isoDate(today);
  const map = new Map<string, OfficialPriceRow>();
  for (const r of rows) map.set(`${r.commodityEnglish}|${isoDate(r.date)}`, r);

  for (const r of live) {
    map.set(`${r.item_name}|${todayKey}`, {
      date: today,
      commodityEnglish: r.item_name,
      commodityNepali: COMMODITY_NEPALI[r.item_name],
      minimumPrice: r.min_price,
      maximumPrice: r.max_price,
      averagePrice: r.avg_price,
      unit: r.unit,
      generated: false,
      source: "kalimatimarket.gov.np/price (live bulletin)",
    });
  }

  return [...map.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function fetchAllOfficialKalimatiPrices(options?: {
  historyFrom?: Date;
  historyTo?: Date;
  includeLiveToday?: boolean;
}): Promise<OfficialPriceRow[]> {
  const to = options?.historyTo ?? new Date();
  to.setUTCHours(12, 0, 0, 0);
  const from =
    options?.historyFrom ??
    (() => {
      const d = new Date(to);
      d.setUTCFullYear(d.getUTCFullYear() - 10);
      d.setUTCHours(12, 0, 0, 0);
      return d;
    })();

  const client = createKalimatiClient();
  const { token, labelToId, sessionCookie } = await discoverKalimatiCommodityIds(client);
  if (!sessionCookie) {
    console.warn("[Kalimati API] No session cookie from /price-history — history API may return empty series");
  }
  console.log(`[Kalimati API] Discovered ${labelToId.size} commodities on price-history page`);

  const all: OfficialPriceRow[] = [];
  for (const target of KALIMATI_OFFICIAL_TARGETS) {
    const series = await fetchOfficialHistoryForTarget(client, token, labelToId, target, from, to);
    all.push(...series);
    console.log(
      `[Kalimati API] ${target.commodityEnglish}: ${series.length} days` +
        (series.length ? ` (${isoDate(series[0].date)} → ${isoDate(series[series.length - 1].date)})` : "")
    );
  }

  if (options?.includeLiveToday !== false) {
    return mergeTodayLiveBulletin(all);
  }
  return all;
}
