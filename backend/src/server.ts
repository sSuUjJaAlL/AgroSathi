import express from "express"
import serverMiddleware from "./middleware/server.middleware";
import serverRouter from "./router/server.router";
import connectToDatabase from "./database/connect";
import { getenvvar } from "./utils/env.utils";
import agrologger from "./libs/logger.libs";
import seederResponse from "./libs/seeder";


async function startExpress() {
  const app = express();

  try {
    await Promise.all([serverMiddleware(app), serverRouter(app)]);
    await connectToDatabase();
    agrologger.info("Database connected successfully");
    await seederResponse();
    const port = Number(getenvvar("PORT"));
    app.listen(port, () => {
      agrologger.info(`App is running on port ${port}`);
    });
  } catch (err) {
    agrologger.error(
      "Startup failed: Database not connected or middleware/router error",
      err
    );
    process.exit(1);
  }
}

export default startExpress;
