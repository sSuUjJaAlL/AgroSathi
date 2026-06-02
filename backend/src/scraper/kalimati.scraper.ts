import axios from "axios";
import * as cheerio from "cheerio";
import { canonicalSelectedCropName } from "../config/selectedCrops.js";

export interface ScrapedRow {
  item_name: string;
  unit: string;
  min_price: number;
  max_price: number;
  avg_price: number;
}

export interface KalimatiScrapeMeta {
  /** Raw heading from the price page (often includes BS date). */
  listing_heading: string | null;
  fetched_at: string;
}

export interface KalimatiScrapeResult {
  rows: ScrapedRow[];
  meta: KalimatiScrapeMeta;
}

const KALIMATI_PRICE_URL = "https://kalimatimarket.gov.np/price";

/** Translates Nepali names (live site) → English names (CSV archive / historical DB). */
const NEPALI_TO_ENGLISH: Record<string, string> = {
  // Ginger
  "अदुवा": "Ginger",
  // Potato
  "आलु रातो(लाम्चो)": "Potato Red",
  "रातो आलु(गोलो)": "Potato Red",
  "आलु रातो": "Potato Red",
  "आलु सेतो": "Potato White",
  // Tomato
  "गोलभेडा ठूलो(नेपाली)": "Tomato Big(Nepali)",
  "गोलभेडा ठूलो(भारतीय)": "Tomato Big(Indian)",
  "गोलभेडा सानो(टनेल)": "Tomato Small(Tunnel)",
  "गोलभेडा सानो(लोकल)": "Tomato Small(Local)",
  "गोलभेडा सानो(भारतीय)": "Tomato Small(Indian)",
  "गोलभेडा सानो(तराई)": "Tomato Small(Terai)",
  "गोलभेडा": "Tomato Big(Nepali)",
  // Onion
  "प्याज सुकेको (भारतीय)": "Onion Dry (Indian)",
  "प्याज सुकेको(भारतीय)": "Onion Dry (Indian)",
  "प्याज सुकेको(चाइनिज)": "Onion Dry (Chinese)",
  "प्याज सुकेको": "Onion Dry (Indian)",
  "प्याज हरियो": "Onion Green",
  // Cauliflower
  "काउली स्थानिय": "Cauli Local",
  "काउली स्थानिय(ज्यापु)": "Cauli Local(Jyapu)",
  "काउली तराई": "Cauli Terai",
  "काउली": "Cauli Local",
  // Cabbage
  "बन्दा(लोकल)": "Cabbage(Local)",
  "बन्दा(तराई)": "Cabbage(Terai)",
  "बन्दा": "Cabbage",
  "रातो बन्दा": "Red Cabbbage",
  // Garlic
  "लसुन सुकेको चाइनिज": "Garlic Dry Chinese",
  "लसुन सुकेको नेपाली": "Garlic Dry Nepali",
  "लसुन हरियो": "Garlic Green",
  "लसुन सुकेको": "Garlic Dry Chinese",
  // Chilli
  "खु्र्सानी सुकेको": "Chilli Dry",
  "खुर्सानी सुकेको": "Chilli Dry",
  "खुर्सानी हरियो(बुलेट)": "Chilli Green(Bullet)",
  "खुर्सानी हरियो(माछे)": "Chilli Green(Machhe)",
  "खुर्सानी हरियो(अकबरे)": "Chilli Green(Akbare)",
  "खुर्सानी हरियो(लाम्चो)": "Chilli Green",
  "खुर्सानी हरियो": "Chilli Green",
  "भेडे खु्र्सानी": "Capsicum",
  "भेडे खुर्सानी": "Capsicum",
  // Carrot
  "गाजर(लोकल)": "Carrot(Local)",
  "गाजर(तराई)": "Carrot(Terai)",
  "गाजर": "Carrot(Local)",
  // Radish
  "सेतो मूला(हाइब्रीड)": "Raddish White(Hybrid)",
  "सेतो मूला(लोकल)": "Raddish White(Local)",
  "रातो मूला": "Raddish Red",
  "मूला": "Raddish White(Local)",
  // Others
  "केरा(नेपाली)": "Banana(Nepali)",
  "केरा(मालभोग)": "Banana(Malbhog)",
  "केरा": "Banana",
  "स्याउ(फूजी)": "Apple(Fuji)",
  "स्याउ(झोले)": "Apple(Jholey)",
  "अनार": "Pomegranate",
  "कागती": "Lime",
  "लीच्ची(भारतीय)": "Litchi(Indian)",
  "लीच्ची(लोकल)": "Litchi(Local)",
  "मेवा(नेपाली)": "Papaya(Nepali)",
  "मेवा(भारतीय)": "Papaya(Indian)",
  "भन्टा लाम्चो": "Brinjal Long",
  "भन्टा डल्लो": "Brinjal Round",
  "तितो करेला": "Bitter Gourd",
  "लौका": "Bottle Gourd",
  "च्याउ(कन्य)": "Mushroom(Kanya)",
  "च्याउ(डल्ले)": "Mushroom(Button)",
  "राजा च्याउ": "Mushroom(Oyster)",
  "सिताके च्याउ": "Mushroom(Shiitake)",
  "गुन्दुक": "Gundruk",
  "तोफु": "Tofu",
  "तामा": "Bamboo Shoot",
  "हरियो धनिया": "Coriander Green",
  "पुदीना": "Mint",
  "पार्सले": "Parseley",
  "पालूगो साग": "Spinach Leaf",
  "रायो साग": "Mustard Leaf",
  "मेथीको साग": "Fenugreek Leaf",
  "चमसूरको साग": "Cress Leaf",
  "सौफको साग": "Fennel Leaf",
  "जिरीको साग": "Coriander Green",
  "सेलरी": "Celery",
  "परवर(लोकल)": "Pointed Gourd(Terai)",
  "घिरौला": "Squash(Long)",
  "स्कूस": "Squash(Round)",
  "घिउ सिमी(राजमा)": "French Bean(Rajma)",
  "घिउ सिमी(लोकल)": "French Bean(Local)",
  "घिउ सिमी(हाइब्रीड)": "French Bean(Hybrid)",
  "मकै बोडी": "Cowpea(Short)",
  "बोडी(तने)": "Sword Bean",
  "मटरकोशा": "Green Peas",
  "सखरखण्ड": "Sweet Potato",
  "पिंडालू": "Arum",
  "न्यूरो": "Asparagus",
  "कुरीलो": "Asparagus",
  "भिण्डी": "Okara",
  "फर्सी पाकेको": "Pumpkin",
  "फर्सी हरियो(लाम्चो)": "Squash(Long)",
  "हरियो फर्सी(डल्लो)": "Pumpkin",
  "चुकुन्दर": "Sugarbeet",
  "इमली": "Tamarind",
  "छ्यापी सुकेको": "Tamarind",
  "तरबुजा(हरियो)": "Water Melon(Green)",
  "रुख कटहर": "Jack Fruit",
  "भुई कटहर": "Christophine",
  "मकै(हरियो)": "Sweet Corn",
  "सजिवन": "Drumstick",
  "ताजा माछा(रहु)": "Fish Fresh(Rahu)",
  "ताजा माछा(बचुवा)": "Fish Fresh(Bachuwa)",
  "ताजा माछा(छडी)": "Fish Fresh(Chhadi)",
  "ताजा माछा(मुंगरी)": "Fish Fresh(Mungari)",
  "भटमासकोशा": "Soyabean Pod",
};

function translateName(name: string): string {
  const trimmed = name.trim();
  return NEPALI_TO_ENGLISH[trimmed] ?? trimmed;
}

/** Devanagari digits → ASCII (Kalimati renders amounts like "रू ८०.००"). */
const DEVANAGARI_DIGIT_MAP: Record<string, string> = {
  "०": "0",
  "१": "1",
  "२": "2",
  "३": "3",
  "४": "4",
  "५": "5",
  "६": "6",
  "७": "7",
  "८": "8",
  "९": "9",
};

function normalizeNumerals(text: string): string {
  return text.replace(/[०-९]/g, (ch) => DEVANAGARI_DIGIT_MAP[ch] ?? ch);
}

export function parseMoney(text: string): number | null {
  let cleaned = normalizeNumerals(text)
    .replace(/\u200c/g, "")
    .replace(/Rs\.?|रूpees?|रू\.?/gi, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractListingHeading($: cheerio.CheerioAPI): string | null {
  const t = $("h4.bottom-head").first().text().replace(/\s+/g, " ").trim();
  return t.length ? t : null;
}

/**
 * Parses the official Kalimati daily price table (`#commodityPriceParticular`).
 * Columns: commodity (Nepali name), unit, min, max, average — prices use Nepali or ASCII digits.
 */
export function parseKalimatiHtml(html: string, fetchedAt = new Date().toISOString()): KalimatiScrapeResult {
  const $ = cheerio.load(html);
  const rows: ScrapedRow[] = [];

  const table = $("#commodityPriceParticular");
  const bodyRows = table.length ? table.find("tbody tr") : $("table tbody tr");

  bodyRows.each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 5) return;

    const name = $(cells[0]).text().replace(/\s+/g, " ").trim();
    const unit = $(cells[1]).text().replace(/\s+/g, " ").trim();
    if (!name || /^कृषि|^ईकाइ|^commodity|^unit$/i.test(name)) return;

    const min = parseMoney($(cells[2]).text());
    const max = parseMoney($(cells[3]).text());
    const avg = parseMoney($(cells[4]).text());
    if (min == null || max == null || avg == null) return;

    const canonical = canonicalSelectedCropName(translateName(name));
    if (!canonical) return;

    rows.push({
      item_name: canonical,
      unit,
      min_price: min,
      max_price: max,
      avg_price: avg,
    });
  });

  return {
    rows: dedupeByName(rows),
    meta: {
      listing_heading: extractListingHeading($),
      fetched_at: fetchedAt,
    },
  };
}

function dedupeByName(rows: ScrapedRow[]): ScrapedRow[] {
  const map = new Map<string, ScrapedRow>();
  for (const r of rows) map.set(r.item_name, r);
  return [...map.values()];
}

/** Class-based Kalimati scraper (class diagram: data ingestion). */
export class KalimatiScraper {
  async scrapePrices(): Promise<KalimatiScrapeResult> {
    const fetchedAt = new Date().toISOString();
    try {
      const { data } = await axios.get<string>(KALIMATI_PRICE_URL, {
        timeout: 45000,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });
      return parseKalimatiHtml(data, fetchedAt);
    } catch (e) {
      console.error("[Kalimati] scrape error:", e instanceof Error ? e.message : e);
      return { rows: [], meta: { listing_heading: null, fetched_at: fetchedAt } };
    }
  }

  parseHtml(html: string, fetchedAt?: string): KalimatiScrapeResult {
    return parseKalimatiHtml(html, fetchedAt);
  }
}

export async function scrapeKalimatiPrices(): Promise<KalimatiScrapeResult> {
  return new KalimatiScraper().scrapePrices();
}
