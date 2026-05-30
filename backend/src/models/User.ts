import mongoose, { Schema, type Document } from "mongoose";

export type UserRole = "farmer" | "buyer";

export interface IUser extends Document {
  email: string;
  password: string;
  role: UserRole;
  cropPreferences: string[];
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    role: { type: String, enum: ["farmer", "buyer"], required: true },
    cropPreferences: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", UserSchema, "users");
