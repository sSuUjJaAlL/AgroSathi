import { connectDatabase } from "../config/database.js";
import { runDailyScrapeJob } from "../jobs/daily.pipeline.js";

async function main() {
  await connectDatabase();
  const r = await runDailyScrapeJob();
  console.log(r);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
