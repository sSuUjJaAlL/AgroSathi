import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { startMongoConnectionLoop } from "../config/database.js";
import { fetchHistoricalWeather } from "../services/openMeteoWeather.js";
import { FuelPrice } from "../models/FuelPrice.js";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

async function fetchWeatherChunked(startIso: string, endIso: string) {
  const out: Awaited<ReturnType<typeof fetchHistoricalWeather>> = [];
  let cur = startIso;
  while (cur <= endIso) {
    const chunkEnd = addDays(cur, 365);
    const sliceEnd = chunkEnd > endIso ? endIso : chunkEnd;
    const part = await fetchHistoricalWeather(cur, sliceEnd);
    out.push(...part);
    cur = addDays(sliceEnd, 1);
  }
  return out;
}

async function main() {
  await new Promise<void>((resolve) => startMongoConnectionLoop(() => resolve()));

  const end = new Date();
  end.setUTCHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 5);
  const startIso = iso(start);
  const endIso = iso(end);

  const weatherRows = await fetchWeatherChunked(startIso, endIso);
  const fuelRows = await FuelPrice.find({
    date: {
      $gte: new Date(startIso + "T00:00:00.000Z"),
      $lte: new Date(endIso + "T23:59:59.999Z"),
    },
  })
    .sort({ date: 1, fuel_type: 1 })
    .lean();

  const outDir = path.resolve(process.cwd(), "../ml-service/data/historical");
  fs.mkdirSync(outDir, { recursive: true });

  const weatherCsv =
    "date,temperature,rainfall,humidity,source\n" +
    weatherRows
      .map((r) => `${iso(new Date(r.date))},${r.temperature},${r.rainfall},${r.humidity},open-meteo-archive`)
      .join("\n");
  fs.writeFileSync(path.join(outDir, "weather_historical_5y.csv"), weatherCsv, "utf-8");

  const fuelCsv =
    "date,fuel_type,price_npr,source\n" +
    fuelRows
      .map((r) => `${iso(new Date(r.date))},${r.fuel_type},${r.price_npr},${(r.source ?? "NOC").replace(/,/g, " ")}`)
      .join("\n");
  fs.writeFileSync(path.join(outDir, "fuel_historical_5y.csv"), fuelCsv, "utf-8");

  console.log("[Historical Export] Wrote weather rows:", weatherRows.length);
  console.log("[Historical Export] Wrote fuel rows:", fuelRows.length);
  console.log("[Historical Export] Output directory:", outDir);
}

main()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });

