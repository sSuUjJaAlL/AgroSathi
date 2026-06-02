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

  const db = mongoose.connection.db;
  if (!db) throw new Error("Mongo db handle unavailable");

  const end = new Date();
  end.setUTCHours(12, 0, 0, 0);
  const start = new Date(end);
  start.setUTCFullYear(start.getUTCFullYear() - 5);

  const startIso = iso(start);
  const endIso = iso(end);

  const weatherRows = await fetchWeatherChunked(startIso, endIso);
  const weatherColl = db.collection("weather_data_historical");
  if (weatherRows.length) {
    await weatherColl.bulkWrite(
      weatherRows.map((r) => ({
        updateOne: {
          filter: { date: r.date },
          update: {
            $set: {
              date: r.date,
              temperature: r.temperature,
              rainfall: r.rainfall,
              humidity: r.humidity,
              source: "open-meteo-archive",
            },
          },
          upsert: true,
        },
      }))
    );
  }

  const fuelStart = new Date(startIso + "T00:00:00.000Z");
  const fuelEnd = new Date(endIso + "T23:59:59.999Z");
  const fuelDocs = await FuelPrice.find({ date: { $gte: fuelStart, $lte: fuelEnd } }).lean();
  const fuelColl = db.collection("fuel_prices_historical");
  if (fuelDocs.length) {
    await fuelColl.bulkWrite(
      fuelDocs.map((f) => ({
        updateOne: {
          filter: { date: f.date, fuel_type: f.fuel_type },
          update: {
            $set: {
              date: f.date,
              fuel_type: f.fuel_type,
              price_npr: f.price_npr,
              source: f.source ?? "NOC",
            },
          },
          upsert: true,
        },
      }))
    );
  }

  await weatherColl.createIndex({ date: 1 }, { unique: true });
  await fuelColl.createIndex({ date: 1, fuel_type: 1 }, { unique: true });
  await fuelColl.createIndex({ date: 1 });

  console.log("[Historical] Weather rows upserted:", weatherRows.length, "range:", `${startIso}..${endIso}`);
  console.log("[Historical] Fuel rows upserted:", fuelDocs.length, "range:", `${startIso}..${endIso}`);
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

