import type { NextFunction, Request, Response } from "express";
import { MongoServerError } from "mongodb";
import { ZodError } from "zod";

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ message: "Not found" });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error("[API]", err);

  if (err instanceof ZodError) {
    const message = err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") || "Invalid request";
    res.status(400).json({ message });
    return;
  }

  if (err instanceof MongoServerError && err.code === 11000) {
    res.status(409).json({ message: "Email already registered" });
    return;
  }

  const httpErr = err as { status?: number; statusCode?: number; message?: string };
  const status = httpErr.status ?? httpErr.statusCode;
  if (typeof status === "number" && status >= 400 && status < 600) {
    res.status(status).json({ message: httpErr.message ?? "Request failed" });
    return;
  }

  const message = err instanceof Error ? err.message : "Internal Server Error";
  res.status(500).json({ message });
}
