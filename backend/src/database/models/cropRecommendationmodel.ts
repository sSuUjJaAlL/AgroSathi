import mongoose from "mongoose";

const cropSchema = new mongoose.Schema({
  crop: String,
  stage: String,
  soil_type: String,
  temp: Number,
  humidity: Number,
  rain: Number,
  wind: Number,
  risk: String,
  advice: String
});

const Crop = mongoose.model("Crop", cropSchema);
export default Crop;