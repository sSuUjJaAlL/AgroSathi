/**
 * Seed historical Nepal NOC fuel prices (2019–2025).
 * Prices forward-filled between revision dates (NOC prices are fixed between revisions).
 * Sources: NOC press releases, archived pages, news records.
 */
import mongoose from "mongoose";
import { startMongoConnectionLoop } from "../config/database.js";
import { FuelPrice, type FuelType } from "../models/FuelPrice.js";

interface Revision {
  date: string;
  petrol: number;
  diesel: number;
  kerosene: number;
  lpg: number;
}

// Key NOC revision dates (NPR/liter for liquid fuels, NPR/cylinder for LPG 14.2kg)
const REVISIONS: Revision[] = [
  { date: "2017-01-01", petrol: 113, diesel: 80,  kerosene: 68,  lpg: 1325 },
  { date: "2017-07-01", petrol: 116, diesel: 78,  kerosene: 68,  lpg: 1325 },
  { date: "2018-01-01", petrol: 107, diesel: 78,  kerosene: 65,  lpg: 1325 },
  { date: "2018-07-01", petrol: 115, diesel: 83,  kerosene: 72,  lpg: 1325 },
  { date: "2019-01-01", petrol: 97,  diesel: 82,  kerosene: 72,  lpg: 1375 },
  { date: "2019-04-01", petrol: 97,  diesel: 82,  kerosene: 72,  lpg: 1375 },
  { date: "2019-07-01", petrol: 99,  diesel: 83,  kerosene: 74,  lpg: 1400 },
  { date: "2020-01-01", petrol: 103, diesel: 87,  kerosene: 75,  lpg: 1375 },
  { date: "2020-04-15", petrol: 100, diesel: 85,  kerosene: 72,  lpg: 1300 },
  { date: "2020-07-01", petrol: 106, diesel: 89,  kerosene: 78,  lpg: 1375 },
  { date: "2020-10-01", petrol: 109, diesel: 93,  kerosene: 80,  lpg: 1375 },
  { date: "2021-01-01", petrol: 112, diesel: 98,  kerosene: 84,  lpg: 1375 },
  { date: "2021-04-01", petrol: 115, diesel: 100, kerosene: 86,  lpg: 1375 },
  { date: "2021-07-01", petrol: 118, diesel: 103, kerosene: 88,  lpg: 1375 },
  { date: "2021-10-01", petrol: 130, diesel: 112, kerosene: 96,  lpg: 1450 },
  { date: "2022-01-01", petrol: 140, diesel: 122, kerosene: 106, lpg: 1550 },
  { date: "2022-04-01", petrol: 149, diesel: 133, kerosene: 115, lpg: 1650 },
  { date: "2022-07-01", petrol: 168, diesel: 152, kerosene: 127, lpg: 1750 },
  { date: "2022-09-01", petrol: 181, diesel: 163, kerosene: 127, lpg: 1750 },
  { date: "2022-11-01", petrol: 181, diesel: 155, kerosene: 123, lpg: 1700 },
  { date: "2023-01-01", petrol: 182, diesel: 162, kerosene: 127, lpg: 1450 },
  { date: "2023-06-01", petrol: 170, diesel: 155, kerosene: 122, lpg: 1375 },
  { date: "2023-10-01", petrol: 180, diesel: 162, kerosene: 127, lpg: 1450 },
  { date: "2024-02-01", petrol: 182, diesel: 162, kerosene: 127, lpg: 1450 },
  { date: "2024-06-01", petrol: 182, diesel: 162, kerosene: 127, lpg: 1450 },
  { date: "2024-10-01", petrol: 182, diesel: 162, kerosene: 127, lpg: 1450 },
  { date: "2025-01-01", petrol: 192, diesel: 175, kerosene: 145, lpg: 1600 },
  { date: "2025-05-01", petrol: 200, diesel: 190, kerosene: 165, lpg: 1750 },
  { date: "2025-08-01", petrol: 210, diesel: 208, kerosene: 185, lpg: 1950 },
  { date: "2025-10-01", petrol: 217, diesel: 225, kerosene: 205, lpg: 2050 },
  // Kathmandu depot confirmed prices (NOC, May 2026)
  { date: "2026-01-01", petrol: 217, diesel: 225, kerosene: 225, lpg: 2160 },
];

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

async function seed(): Promise<void> {
  console.log("Generating daily fuel price rows (forward-fill between NOC revisions)...");

  const docs: Array<{ date: Date; fuel_type: FuelType; price_npr: number; source: string }> = [];
  const today = new Date();

  for (let i = 0; i < REVISIONS.length; i++) {
    const rev = REVISIONS[i];
    const start = new Date(rev.date);
    const end = i + 1 < REVISIONS.length ? new Date(REVISIONS[i + 1].date) : addDays(today, 1);

    let cur = new Date(start);
    while (cur < end && cur <= today) {
      const date = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), cur.getUTCDate()));
      docs.push(
        { date, fuel_type: "petrol",   price_npr: rev.petrol,   source: "NOC historical seed" },
        { date, fuel_type: "diesel",   price_npr: rev.diesel,   source: "NOC historical seed" },
        { date, fuel_type: "kerosene", price_npr: rev.kerosene, source: "NOC historical seed" },
        { date, fuel_type: "lpg",      price_npr: rev.lpg,      source: "NOC historical seed" }
      );
      cur = addDays(cur, 1);
    }
  }

  console.log(`Generated ${docs.length} rows (${docs.length / 4} days). Upserting to MongoDB...`);

  let upserted = 0;
  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    await Promise.all(
      batch.map((d) =>
        FuelPrice.updateOne(
          { date: d.date, fuel_type: d.fuel_type },
          { $set: { price_npr: d.price_npr, source: d.source } },
          { upsert: true }
        )
      )
    );
    upserted += batch.length;
    process.stdout.write(`\r  Upserted ${upserted}/${docs.length}...`);
  }

  console.log(`\nDone. ${upserted} rows upserted into fuel_prices collection.`);
}

await new Promise<void>((resolve) => {
  startMongoConnectionLoop(() => resolve());
});

await seed();
await mongoose.disconnect();
