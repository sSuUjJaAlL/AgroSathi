import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { z } from "zod";
import { env } from "../../config/env.js";
import type { UserRole } from "../../models/User.js";
import type { AuthPayload } from "../../middleware/auth.middleware.js";
import { AuthRepository } from "./auth.repository.js";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["farmer", "buyer"]),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}

  async register(body: unknown) {
    const parsed = registerSchema.parse(body);
    const existing = await this.repo.findByEmail(parsed.email);
    if (existing) {
      throw new Error("Email already registered");
    }
    const hash = await bcrypt.hash(parsed.password, 10);
    const user = await this.repo.create({
      email: parsed.email,
      password: hash,
      role: parsed.role as UserRole,
    });
    const token = this.signToken(user.id, user.email, user.role);
    return { token, user: { email: user.email, role: user.role } };
  }

  async login(body: unknown) {
    const parsed = loginSchema.parse(body);
    const user = await this.repo.findByEmail(parsed.email);
    if (!user || !(await bcrypt.compare(parsed.password, user.password))) {
      throw new Error("Invalid credentials");
    }
    const token = this.signToken(user.id, user.email, user.role);
    return { token, user: { email: user.email, role: user.role } };
  }

  private signToken(sub: string, email: string, role: UserRole): string {
    const payload: AuthPayload = { sub, email, role };
    return jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as SignOptions);
  }
}
