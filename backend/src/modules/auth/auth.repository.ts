import { User, type IUser, type UserRole } from "../../models/User.js";

export class AuthRepository {
  async findByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase().trim() });
  }

  async create(data: { email: string; password: string; role: UserRole }): Promise<IUser> {
    return User.create(data);
  }
}
