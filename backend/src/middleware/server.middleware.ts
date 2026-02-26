import { Application } from "express";
import express from "express";
import cors from "cors";
import corsconfig from "../config/cors.config";

async function serverMiddleware(app: Application) {
    app.use(cors(corsconfig));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
}

export default serverMiddleware;
