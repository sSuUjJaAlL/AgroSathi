import mongoose, { Schema, type Document } from "mongoose";

export type FuelType = "petrol" | "diesel" | "kerosene" | "lpg";

export interface IFuelPrice extends Document {
  date: Date;
  fuel_type: FuelType;
  price_npr: number;
  source: string;
}

const FuelPriceSchema = new Schema<IFuelPrice>(
  {
    date: { type: Date, required: true },
    fuel_type: { type: String, enum: ["petrol", "diesel", "kerosene", "lpg"], required: true },
    price_npr: { type: Number, required: true },
    source: { type: String, default: "NOC" },
  },
  { timestamps: true }
);

FuelPriceSchema.index({ date: 1, fuel_type: 1 }, { unique: true });
FuelPriceSchema.index({ fuel_type: 1, date: -1 });

export const FuelPrice = mongoose.model<IFuelPrice>("FuelPrice", FuelPriceSchema, "fuel_prices");
