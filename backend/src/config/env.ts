import dotenv from "dotenv";

dotenv.config();

const required = ["MONGODB_URI", "JWT_SECRET"] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`Warning: ${key} is not set. Using defaults where possible.`);
  }
}

export const env = {
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGODB_URI || "mongodb://localhost:27017/agri_price_nepal",
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  mlServiceUrl: process.env.ML_SERVICE_URL || "http://localhost:8000",
  cronDailyPipeline: process.env.CRON_DAILY_PIPELINE || process.env.CRON_SCRAPE || "5 6 * * *",
  smtp: {
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || process.env.SMTP_USER || "",
  },
};
