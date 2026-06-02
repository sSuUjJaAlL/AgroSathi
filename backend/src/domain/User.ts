import { User as UserModel, type IUser, type UserRole } from "../models/User.js";

/**
 * Domain model (class diagram): authenticated user persistence.
 */
export class User {
  email?: string;
  password?: string;
  role?: UserRole;
  createdAt?: Date;
  updatedAt?: Date;

  async findByEmail(email: string): Promise<IUser | null> {
    return UserModel.findOne({ email: email.toLowerCase().trim() });
  }

  async create(data: { email: string; password: string; role: UserRole }): Promise<IUser> {
    return UserModel.create(data);
  }
}
