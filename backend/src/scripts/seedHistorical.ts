/**
 * DEMO ONLY: seeds synthetic daily weather, fuel, and crop prices (not real Kalimati bulletin data).
 * For presentations use real data: `npm run pipeline:once` (CSV archive + live scrape + Open-Meteo weather).
 * Optional: npm run import-csv -- path/to/file.csv (see importCsv.ts).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "../config/database.js";
import { CropPrice } from "../models/CropPrice.js";
import { WeatherData } from "../models/WeatherData.js";
import { FuelData } from "../models/FuelData.js";

const DAYS = 760;
const MS_PER_DAY = 86400000;

const BASE_ITEMS: Array<{ name: string; base: number }> = [
  { name: "Tomato Big(Nepali)", base: 45 },
  { name: "Potato Red", base: 35 },
  { name: "Onion Dry (Indian)", base: 55 },
  { name: "Cabbage(Local)", base: 40 },
  { name: "Cauli Local", base: 50 },
  { name: "Carrot(Local)", base: 80 },
  { name: "Green Chili", base: 120 },
  { name: "Apple(Fuji)", base: 280 },
];

function startDate(): Date {
  const now = Date.now();
  return new Date(now - DAYS * MS_PER_DAY);
}

function seasonalTemp(dayIndex: number): number {
  const cycle = Math.sin((dayIndex / 365) * Math.PI * 2);
  return 18 + cycle * 8 + (Math.random() - 0.5) * 3;
}

function seasonalRain(dayIndex: number): number {
  const monsoon = Math.max(0, Math.sin(((dayIndex + 120) / 365) * Math.PI * 2));
  return monsoon * 25 + Math.random() * 6;
}

function humidityFromRain(rain: number, temp: number): number {
  return Math.min(95, Math.max(35, 55 + rain * 0.6 - (temp - 18)));
}

async function seedWeatherFuel(start: Date) {
  const weatherBulk: Array<{ date: Date; temperature: number; rainfall: number; humidity: number }> = [];
  const fuelBulk: Array<{ date: Date; petrol_price: number; diesel_price: number }> = [];

  let petrol = 178;
  let diesel = 163;

  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start.getTime() + i * MS_PER_DAY);
    const temp = seasonalTemp(i);
    const rain = seasonalRain(i);
    const hum = humidityFromRain(rain, temp);

    weatherBulk.push({
      date: d,
      temperature: Number(temp.toFixed(2)),
      rainfall: Number(rain.toFixed(2)),
      humidity: Number(hum.toFixed(2)),
    });

    petrol += (Math.random() - 0.48) * 1.2;
    diesel += (Math.random() - 0.48) * 1.1;
    petrol = Math.max(150, Math.min(210, petrol));
    diesel = Math.max(135, Math.min(195, diesel));

    fuelBulk.push({
      date: d,
      petrol_price: Number(petrol.toFixed(2)),
      diesel_price: Number(diesel.toFixed(2)),
    });
  }

  await WeatherData.deleteMany({});
  await FuelData.deleteMany({});
  await WeatherData.insertMany(weatherBulk);
  await FuelData.insertMany(fuelBulk);
}

async function seedCropPrices(start: Date) {
  const bulk: Array<{
    date: Date;
    item_name: string;
    min_price: number;
    max_price: number;
    avg_price: number;
  }> = [];

  const rngState = BASE_ITEMS.map(() => ({ vol: 1 + Math.random() * 0.05, walk: 0 }));

  for (let i = 0; i < DAYS; i++) {
    const d = new Date(start.getTime() + i * MS_PER_DAY);
    const rain = seasonalRain(i);
    const fuelAdj = 1 + Math.sin(i / 90) * 0.03;

    BASE_ITEMS.forEach((item, j) => {
      rngState[j].walk += (Math.random() - 0.5) * 0.08;
      rngState[j].walk *= 0.92;
      const weatherShock = (rain > 15 ? 1.04 : 0.98) * fuelAdj;
      let avg = item.base * weatherShock * (1 + rngState[j].walk) * rngState[j].vol;
      avg = Math.max(5, avg + (Math.random() - 0.5) * 3);
      const spread = avg * (0.05 + Math.random() * 0.08);
      const min = Math.max(1, avg - spread);
      const max = avg + spread;
      bulk.push({
        date: d,
        item_name: item.name,
        min_price: Number(min.toFixed(2)),
        max_price: Number(max.toFixed(2)),
        avg_price: Number(avg.toFixed(2)),
      });
    });
  }

  await CropPrice.deleteMany({});
  for (let i = 0; i < bulk.length; i += 5000) {
    await CropPrice.insertMany(bulk.slice(i, i + 5000));
  }
}

/** Inserts historical weather, fuel, and crop series (requires active Mongo connection). */
export async function runHistoricalSeed(): Promise<void> {
  const start = startDate();
  console.log("[Seed] From", start.toISOString());
  await seedWeatherFuel(start);
  await seedCropPrices(start);
  console.log("[Seed] Done.");
}

async function cliMain() {
  await connectDatabase();
  await runHistoricalSeed();
  process.exit(0);
}

const thisFile = fileURLToPath(import.meta.url);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : "";
const runAsCli = entry === thisFile || entry.endsWith(`${path.sep}seedHistorical.ts`);

if (runAsCli) {
  cliMain().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
