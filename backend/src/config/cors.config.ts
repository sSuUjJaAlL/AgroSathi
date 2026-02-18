import { CorsOptions } from "cors";

export const corsconfig: CorsOptions = {
  origin: [
    "http://localhost:3000",   // Next.js frontend
    "http://127.0.0.1:3000"
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true, // allow cookies / tokens
  optionsSuccessStatus: 200
};
