/**
 * Fills weather_data from Open-Meteo historical archive for the date span of kalimati_prices in MongoDB.
 */
import { KalimatiPrice } from "../models/KalimatiPrice.js";
import { WeatherData } from "../models/WeatherData.js";
import { fetchHistoricalWeather, type DailyWeatherRow } from "../services/openMeteoWeather.js";

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00.000Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchWeatherChunked(startIso: string, endIso: string): Promise<DailyWeatherRow[]> {
  const out: DailyWeatherRow[] = [];
  let cur = startIso;
  while (cur <= endIso) {
    const chunkEnd = addDays(cur, 365);
    const sliceEnd = chunkEnd > endIso ? endIso : chunkEnd;
    const part = await fetchHistoricalWeather(cur, sliceEnd);
    out.push(...part);
    cur = addDays(sliceEnd, 1);
  }
  return out;
}

export async function syncWeatherForCropDateRange(): Promise<{ inserted: number; range: string }> {
  const agg = await KalimatiPrice.aggregate<{ _min: Date; _max: Date }>([
    { $group: { _id: null, _min: { $min: "$date" }, _max: { $max: "$date" } } },
  ]);
  if (!agg.length || !agg[0]._min || !agg[0]._max) {
    return { inserted: 0, range: "(no kalimati_prices)" };
  }

  const cropStart = toIsoDate(new Date(agg[0]._min));
  const end = toIsoDate(new Date(agg[0]._max));
  const latestWeather = await WeatherData.findOne().sort({ date: -1 }).select("date").lean();
  const start = latestWeather?.date ? addDays(toIsoDate(new Date(latestWeather.date)), 1) : cropStart;
  if (start > end) return { inserted: 0, range: `${start}..${end} (up-to-date)` };

  const rows = await fetchWeatherChunked(start, end);
  if (!rows.length) return { inserted: 0, range: `${start}..${end}` };

  await WeatherData.bulkWrite(
    rows.map((r) => ({
      updateOne: {
        filter: { date: r.date },
        update: {
          $set: {
            date: r.date,
            temperature: r.temperature,
            rainfall: r.rainfall,
            humidity: r.humidity,
          },
        },
        upsert: true,
      },
    }))
  );

  return { inserted: rows.length, range: `${start}..${end}` };
}
