import { Application } from "express";
import express from "express";
import cors from "cors";

async function serverMiddleware(app: Application) {
    app.use(
        cors({
            origin: ["http://localhost:3000", "http://localhost:3001"],
            methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            allowedHeaders: ["Content-Type", "Authorization", "x-correlation-id"],
            credentials: true,
        })
    );
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
}

export default serverMiddleware;
