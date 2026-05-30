import mongoose from "mongoose";
import { env } from "./env.js";

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDatabase(): Promise<void> {
  mongoose.set("strictQuery", true);
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    retryWrites: true,
  });
}

mongoose.connection.on("connected", () => console.log("[MongoDB] Connection established."));
mongoose.connection.on("error", (err) => console.error("[MongoDB] Connection error:", err.message));
mongoose.connection.on("disconnected", () => console.warn("[MongoDB] Disconnected. Will retry…"));

/**
 * Retries until MongoDB is reachable (Atlas or Docker may take time to accept connections).
 * Invokes `onConnected` once when the first successful connection is established.
 */
export function startMongoConnectionLoop(onConnected?: () => void): void {
  void (async function retry(): Promise<void> {
    let notified = false;
    for (let attempt = 1; attempt <= 200; attempt++) {
      try {
        if (mongoose.connection.readyState === 1) {
          if (!notified) {
            notified = true;
            onConnected?.();
          }
          return;
        }
        if (mongoose.connection.readyState === 2) {
          await new Promise((r) => setTimeout(r, 500));
          continue;
        }
        await connectDatabase();
        console.log("[MongoDB] Connected.");
        if (!notified) {
          notified = true;
          onConnected?.();
        }
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn(`[MongoDB] Attempt ${attempt}/200 — ${msg}`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
    console.error("[MongoDB] Stopped retrying. Check your MONGODB_URI in .env (Atlas or Docker).");
  })();
}
