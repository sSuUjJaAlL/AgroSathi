import mongoose, { Schema, type Document } from "mongoose";

export interface IWeatherData extends Document {
  date: Date;
  temperature: number;
  rainfall: number;
  humidity: number;
}

const WeatherSchema = new Schema<IWeatherData>(
  {
    date: { type: Date, required: true },
    temperature: { type: Number, required: true },
    rainfall: { type: Number, required: true },
    humidity: { type: Number, required: true },
  },
  { timestamps: true }
);

WeatherSchema.index({ date: 1 }, { unique: true });

export const WeatherData = mongoose.model<IWeatherData>("WeatherData", WeatherSchema, "weather_data");
