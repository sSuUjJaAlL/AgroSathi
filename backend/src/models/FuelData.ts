import mongoose, { Schema, type Document } from "mongoose";

export interface IFuelData extends Document {
  date: Date;
  petrol_price: number;
  diesel_price: number;
}

const FuelSchema = new Schema<IFuelData>(
  {
    date: { type: Date, required: true },
    petrol_price: { type: Number, required: true },
    diesel_price: { type: Number, required: true },
  },
  { timestamps: true }
);

FuelSchema.index({ date: 1 }, { unique: true });

export const FuelData = mongoose.model<IFuelData>("FuelData", FuelSchema, "fuel_data");
