/**
 * Kaggle / CSV fallback: columns date,item_name,min_price,max_price,avg_price
 * Usage: npx tsx src/scripts/importCsv.ts /path/to/prices.csv
 */
import fs from "fs";
import readline from "readline";
import { connectDatabase } from "../config/database.js";
import { CropPrice } from "../models/CropPrice.js";

async function main() {
  const path = process.argv[2];
  if (!path || !fs.existsSync(path)) {
    console.error("Usage: importCsv <csv-path>");
    process.exit(1);
  }
  await connectDatabase();

  const rl = readline.createInterface({ input: fs.createReadStream(path), crlfDelay: Infinity });
  let header: string[] | null = null;
  let n = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (!header) {
      header = cols.map((c) => c.toLowerCase());
      continue;
    }
    const row: Record<string, string> = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    const date = new Date(row["date"] || row["Date"]);
    const item = row["item_name"] || row["item"] || row["commodity"];
    const min = Number(row["min_price"] ?? row["min"]);
    const max = Number(row["max_price"] ?? row["max"]);
    const avg = Number(row["avg_price"] ?? row["avg"] ?? row["average"]);
    if (!item || !Number.isFinite(date.getTime()) || !Number.isFinite(avg)) continue;
    await CropPrice.updateOne(
      { date, item_name: item },
      {
        $set: {
          date,
          item_name: item,
          min_price: Number.isFinite(min) ? min : avg * 0.9,
          max_price: Number.isFinite(max) ? max : avg * 1.1,
          avg_price: avg,
        },
      },
      { upsert: true }
    );
    n++;
  }
  console.log("Imported/updated rows:", n);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
