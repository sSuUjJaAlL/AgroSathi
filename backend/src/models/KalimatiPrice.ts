import mongoose, { Schema, type Document } from "mongoose";

export interface IKalimatiPrice extends Document {
  commodityEnglish: string;
  commodityNepali: string;
  date: Date;
  minimumPrice: number;
  maximumPrice: number;
  averagePrice: number;
  unit: string;
  generated: boolean;
  source: string;
}

const KalimatiPriceSchema = new Schema<IKalimatiPrice>(
  {
    commodityEnglish: { type: String, required: true, trim: true },
    commodityNepali: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    minimumPrice: { type: Number, required: true },
    maximumPrice: { type: Number, required: true },
    averagePrice: { type: Number, required: true },
    unit: { type: String, default: "Kg" },
    generated: { type: Boolean, default: false },
    source: { type: String, default: "Kalimati" },
  },
  { timestamps: true }
);

KalimatiPriceSchema.index({ commodityEnglish: 1, date: 1 }, { unique: true });
KalimatiPriceSchema.index({ commodityNepali: 1, date: 1 });
KalimatiPriceSchema.index({ commodityEnglish: 1, date: -1 });

export const KalimatiPrice = mongoose.model<IKalimatiPrice>(
  "KalimatiPrice",
  KalimatiPriceSchema,
  "kalimati_prices"
);
