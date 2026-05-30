import mongoose, { Schema, type Document } from "mongoose";

export interface ICropPrice extends Document {
  date: Date;
  item_name: string;
  min_price: number;
  max_price: number;
  avg_price: number;
  source?: string;
  isOutlier?: boolean;
}

const CropPriceSchema = new Schema<ICropPrice>(
  {
    date: { type: Date, required: true },
    item_name: { type: String, required: true, trim: true },
    min_price: { type: Number, required: true },
    max_price: { type: Number, required: true },
    avg_price: { type: Number, required: true },
    source: { type: String },
    isOutlier: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CropPriceSchema.index({ date: 1, item_name: 1 }, { unique: true });

export const CropPrice = mongoose.model<ICropPrice>("CropPrice", CropPriceSchema, "crop_prices");
