import fs from "fs";
import csv from "csv-parser";
import path from "path";


import Crop from "../database/models/cropRecommendationmodel";


export default async function seederResponse() {
    const results: any[] = [];
    fs.createReadStream(path.join(__dirname, "nepal_crop_weather_soil_1200 (2).csv"))
        .pipe(csv())
        .on("data", (data: any) => {
            results.push({
                crop: data.crop,
                stage: data.stage,
                soil_type: data.soil_type,
                temp: Number(data.temp),
                humidity: Number(data.humidity),
                rain: Number(data.rain),
                wind: Number(data.wind),
                risk: data.risk,
                advice: data.advice
            });
        })
        .on("end", async () => {
            try {
                await Crop.deleteMany({}); // optional clear old data
                await Crop.insertMany(results);
                console.log("CSV Data Inserted Successfully");
      
            } catch (error) {
                console.error(error);
    
            }
        })
};