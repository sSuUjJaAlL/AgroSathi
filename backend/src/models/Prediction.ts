import mongoose, { Schema, type Document } from "mongoose";

export type TrendLabel = "Increasing" | "Decreasing" | "Stable";
export type Horizon = "7d" | "30d";
export type Algorithm = "random_forest" | "moving_average" | "lstm";

export interface IPrediction extends Document {
  date: Date;
  item_name: string;
  predicted_price: number;
  trend?: TrendLabel;
  accuracy?: number;
  horizon: Horizon;
  confidence?: string;
  reason?: string;
  target_date?: Date;
  forecast_batch_id?: string;
  algorithm?: Algorithm;
}

const PredictionSchema = new Schema<IPrediction>(
  {
    date: { type: Date, required: true },
    item_name: { type: String, required: true, trim: true },
    predicted_price: { type: Number, required: true },
    trend: { type: String, enum: ["Increasing", "Decreasing", "Stable"] },
    accuracy: { type: Number },
    horizon: { type: String, enum: ["7d", "30d"], required: true },
    confidence: { type: String },
    reason: { type: String },
    target_date: { type: Date },
    forecast_batch_id: { type: String },
    algorithm: { type: String, enum: ["random_forest", "moving_average", "lstm"] },
  },
  { timestamps: true }
);

PredictionSchema.index({ item_name: 1, horizon: 1, date: -1 });
PredictionSchema.index({ item_name: 1, horizon: 1, target_date: 1 });
PredictionSchema.index({ item_name: 1, horizon: 1, algorithm: 1, date: -1 });
PredictionSchema.index({ item_name: 1, horizon: 1, forecast_batch_id: 1, target_date: 1 });
PredictionSchema.index({ item_name: 1, horizon: 1, algorithm: 1, forecast_batch_id: 1, target_date: 1 });
PredictionSchema.index({ horizon: 1, date: -1 });

export const Prediction = mongoose.model<IPrediction>("Prediction", PredictionSchema, "predictions");
