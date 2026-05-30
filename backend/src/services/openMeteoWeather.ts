import axios from "axios";

/** Kathmandu — Kalimati market area (~coordinates). */
const LAT = 27.7172;
const LON = 85.324;

export interface DailyWeatherRow {
  date: Date;
  temperature: number;
  rainfall: number;
  humidity: number;
}

/**
 * Historical daily weather (ERA5-based) from Open-Meteo — no API key.
 * @see https://open-meteo.com/en/docs/historical-api
 */
export async function fetchHistoricalWeather(startIso: string, endIso: string): Promise<DailyWeatherRow[]> {
  const url = "https://archive-api.open-meteo.com/v1/archive";
  const { data } = await axios.get<{
    daily?: {
      time: string[];
      temperature_2m_mean?: (number | null)[];
      precipitation_sum?: (number | null)[];
      relative_humidity_2m_mean?: (number | null)[];
    };
  }>(url, {
    timeout: 120_000,
    params: {
      latitude: LAT,
      longitude: LON,
      start_date: startIso,
      end_date: endIso,
      daily: "temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean",
    },
  });

  const d = data.daily;
  if (!d?.time?.length) return [];

  const rows: DailyWeatherRow[] = [];
  for (let i = 0; i < d.time.length; i++) {
    const t = d.temperature_2m_mean?.[i];
    const rain = d.precipitation_sum?.[i];
    const hum = d.relative_humidity_2m_mean?.[i];
    if (t == null || rain == null || hum == null) continue;
    rows.push({
      date: new Date(d.time[i] + "T12:00:00.000Z"),
      temperature: Number(t.toFixed(2)),
      rainfall: Number(rain.toFixed(2)),
      humidity: Number(hum.toFixed(2)),
    });
  }
  return rows;
}
