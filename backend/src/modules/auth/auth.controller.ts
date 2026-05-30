import type { Request, Response } from "express";
import { AuthService } from "./auth.service.js";

export class AuthController {
  constructor(private readonly service: AuthService) {}

  register = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.register(req.body);
      res.status(201).json(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Registration failed";
      const status = msg === "Email already registered" ? 409 : 400;
      res.status(status).json({ message: msg });
    }
  };

  login = async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.service.login(req.body);
      res.json(result);
    } catch {
      res.status(401).json({ message: "Invalid credentials" });
    }
  };

  me = async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }
    res.json({ email: req.user.email, role: req.user.role });
  };
}
