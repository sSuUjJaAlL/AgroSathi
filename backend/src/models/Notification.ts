import mongoose, { Schema, type Document } from "mongoose";

export type NotificationDirection = "DROP" | "RISE";

export interface INotification extends Document {
  commodity: string;
  direction: NotificationDirection;
  horizon: "7d" | "30d";
  targetRole: "buyer" | "farmer";
  message: string;
  percentChange: number;
  currentPrice: number;
  forecastPrice: number;
  readBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    commodity: { type: String, required: true, trim: true },
    direction: { type: String, enum: ["DROP", "RISE"], required: true },
    horizon: { type: String, enum: ["7d", "30d"], required: true },
    targetRole: { type: String, enum: ["buyer", "farmer"], required: true },
    message: { type: String, required: true },
    percentChange: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    forecastPrice: { type: Number, required: true },
    readBy: [{ type: String }],
  },
  { timestamps: true }
);

NotificationSchema.index({ targetRole: 1, createdAt: -1 });
NotificationSchema.index({ commodity: 1, direction: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>("Notification", NotificationSchema, "notifications");
