import mongoose from "mongoose";
import { getenvvar } from "../utils/env.utils";
import agrologger from "../libs/logger.libs";

export default async function connectToDatabase(): Promise<typeof mongoose> {
  const connection = await mongoose.connect(
    getenvvar("MONGO_URL") as string
  );

  agrologger.info("MongoDB connected");
  return connection;
}
