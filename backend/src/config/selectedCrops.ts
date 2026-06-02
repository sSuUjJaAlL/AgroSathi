/** Canonical Kalimati commodities stored in `kalimati_prices`. */
export const SELECTED_CROPS = [
  "Apple (Fuji)",
  "Lemon",
  "Ginger",
  "Carrot (Local)",
  "Garlic green",
  "Dry chilli",
  "Red potato (round)",
  "Tomato small (local)",
] as const;

export type SelectedCrop = (typeof SELECTED_CROPS)[number];

export const COMMODITY_NEPALI: Record<SelectedCrop, string> = {
  "Apple (Fuji)": "स्याउ (फुजी)",
  Lemon: "कागती",
  Ginger: "अदुवा",
  "Carrot (Local)": "गाजर (लोकल)",
  "Garlic green": "हरियो लसुन",
  "Dry chilli": "खुर्सानी सुक्केको",
  "Red potato (round)": "रातो आलु (गोलो)",
  "Tomato small (local)": "गोलभेडा सानो (लोकल)",
};

const ALIASES: Record<string, SelectedCrop> = {
  "apple (fuji)": "Apple (Fuji)",
  "apple(fuji)": "Apple (Fuji)",
  lemon: "Lemon",
  lime: "Lemon",
  ginger: "Ginger",
  "carrot (local)": "Carrot (Local)",
  "carrot(local)": "Carrot (Local)",
  "garlic green": "Garlic green",
  "garlicgreen": "Garlic green",
  "dry chilli": "Dry chilli",
  "dry chili": "Dry chilli",
  "chilli dry": "Dry chilli",
  "chili dry": "Dry chilli",
  "red potato (round)": "Red potato (round)",
  "potato red": "Red potato (round)",
  "tomato small (local)": "Tomato small (local)",
  "tomato small(local)": "Tomato small (local)",
  "garlic dry chinese": "Garlic green",
};

/** Normalize Nepali/English labels for matching (ignore spaces & parentheses). */
export function normCommodityKey(name: string): string {
  return name
    .replace(/\u200c/g, "")
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "")
    .toLowerCase();
}

/** Extra Nepali spellings seen on the live Kalimati price table. */
const NEPALI_LABEL_ALIASES: Partial<Record<SelectedCrop, string[]>> = {
  "Apple (Fuji)": ["स्याउ(फूजी)", "स्याउ (फुजी)", "स्याउ(फुजी)"],
  "Garlic green": ["लसुन हरियो", "हरियो लसुन"],
  "Dry chilli": ["खु्र्सानी सुकेको", "खुर्सानी सुकेको", "खुर्सानी सुक्केको"],
  "Red potato (round)": ["रातो आलु(गोलो)", "रातो आलु (गोलो)"],
  "Tomato small (local)": ["गोलभेडा सानो(लोकल)", "गोलभेडा सानो (लोकल)"],
  "Carrot (Local)": ["गाजर(लोकल)", "गाजर (लोकल)"],
};

export function canonicalSelectedCropName(name: string): SelectedCrop | null {
  const key = name.trim().toLowerCase();
  if (ALIASES[key]) return ALIASES[key];
  const direct = SELECTED_CROPS.find((c) => c.toLowerCase() === key);
  return direct ?? null;
}

/** Match live-site Nepali or English product label to one of the 8 selected commodities. */
export function matchSelectedCropByLabel(label: string): SelectedCrop | null {
  const trimmed = label.trim();
  if (!trimmed) return null;

  const english = canonicalSelectedCropName(trimmed);
  if (english) return english;

  const key = normCommodityKey(trimmed);
  for (const crop of SELECTED_CROPS) {
    if (normCommodityKey(crop) === key) return crop;
    if (normCommodityKey(COMMODITY_NEPALI[crop]) === key) return crop;
    const extras = NEPALI_LABEL_ALIASES[crop] ?? [];
    if (extras.some((a) => normCommodityKey(a) === key)) return crop;
  }
  return null;
}

/** Higher score = better Nepali label match (used when several rows map to same crop). */
export function nepaliMatchScore(label: string, crop: SelectedCrop): number {
  const key = normCommodityKey(label);
  if (normCommodityKey(COMMODITY_NEPALI[crop]) === key) return 3;
  const extras = NEPALI_LABEL_ALIASES[crop] ?? [];
  if (extras.some((a) => normCommodityKey(a) === key)) return 2;
  if (normCommodityKey(crop) === key) return 1;
  return 0;
}

export function resolveSelectedCrop(name: string): SelectedCrop | null {
  return canonicalSelectedCropName(name);
}

export function isSelectedCrop(name: string): boolean {
  return resolveSelectedCrop(name) !== null;
}
