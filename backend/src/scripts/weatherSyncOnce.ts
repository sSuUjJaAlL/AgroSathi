import { connectDatabase } from "../config/database.js";
import { syncWeatherForCropDateRange } from "./syncWeatherOpenMeteo.js";

async function main() {
  await connectDatabase();
  const r = await syncWeatherForCropDateRange();
  console.log("[Open-Meteo]", r);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
