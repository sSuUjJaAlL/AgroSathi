import axios from "axios";
import * as cheerio from "cheerio";
import { withKalimatiRetry, KALIMATI_PRICE_HISTORY_URL } from "../scraper/kalimatiOfficialApi.js";

const KALIMATI_PRICE_HISTORY_API = "https://kalimatimarket.gov.np/api/price-history";

function cookieHeader(setCookie: string[] | undefined): string {
  if (!setCookie?.length) return "";
  return setCookie.map((c) => c.split(";")[0]).join("; ");
}

async function main() {
  const bare = axios.create({
    timeout: 60_000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      Accept: "text/html,application/json",
    },
  });
  const page = await bare.get<string>(KALIMATI_PRICE_HISTORY_URL);
  const cookies = cookieHeader(page.headers["set-cookie"]);
  const $ = cheerio.load(page.data);
  const token = $('input[name="_token"]').attr("value")?.trim() ?? "";
  const id = $("#commodity_selector option")
    .filter((_i, o) => $(o).text().trim() === "रातो आलु(गोलो)")
    .attr("value")!;
  console.log("session cookies:", cookies.slice(0, 80) + (cookies.length > 80 ? "…" : ""));
  console.log("commodity id:", id);

  if (cookies) bare.defaults.headers.common.Cookie = cookies;
  bare.defaults.headers.Referer = KALIMATI_PRICE_HISTORY_URL;
  const cases = [
    { label: "2026 YTD", locale: "en", from: "2026-01-01", to: "2026-06-02" },
    { label: "2026 Apr-May", locale: "en", from: "2026-04-01", to: "2026-05-31" },
    { label: "2026 Mar", locale: "en", from: "2026-03-01", to: "2026-03-31" },
    { label: "2026 Jan", locale: "en", from: "2026-01-01", to: "2026-01-31" },
    { label: "2025 Dec", locale: "en", from: "2025-12-01", to: "2025-12-31" },
  ] as const;

  for (const c of cases) {
    const params = new URLSearchParams({
      locale: c.locale,
      _token: token,
      from: c.from,
      to: c.to,
    });
    const { data } = await withKalimatiRetry(c.label, () =>
      bare.post(`${KALIMATI_PRICE_HISTORY_API}/${id}`, params.toString(), {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
      })
    );
    const n = (data as { prices?: { date?: unknown[] } })?.prices?.date?.length ?? 0;
    const prices = (data as { prices?: { date?: string[]; avg?: number[] } })?.prices;
    console.log(
      c.label,
      "->",
      n,
      "days",
      n ? `first=${prices?.date?.[0]} avg=${prices?.avg?.[0]}` : JSON.stringify(data).slice(0, 120)
    );
  }
}

main().catch(console.error);
