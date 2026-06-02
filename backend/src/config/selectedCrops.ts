export const SELECTED_CROPS = [
  "Tomato Small (Local)",
  "Ginger",
  "Cabbage (Local)",
  "Dry Chilli",
  "Garlic Dry Chinese",
  "Carrot (Local)",
  "Potato Red",
  "Onion Dry (Indian)",
] as const;

export type SelectedCrop = (typeof SELECTED_CROPS)[number];

const ALIASES: Record<string, SelectedCrop> = {
  "tomato small(local)": "Tomato Small (Local)",
  "tomato small (local)": "Tomato Small (Local)",
  "ginger": "Ginger",
  "cabbage(local)": "Cabbage (Local)",
  "cabbage (local)": "Cabbage (Local)",
  "chilli dry": "Dry Chilli",
  "dry chilli": "Dry Chilli",
  "garlic dry chinese": "Garlic Dry Chinese",
  "carrot(local)": "Carrot (Local)",
  "carrot (local)": "Carrot (Local)",
  "potato red": "Potato Red",
  "onion dry (indian)": "Onion Dry (Indian)",
  "onion dry(indian)": "Onion Dry (Indian)",
};

export function canonicalSelectedCropName(name: string): SelectedCrop | null {
  const key = name.trim().toLowerCase();
  return ALIASES[key] ?? null;
}

export function isSelectedCrop(name: string): boolean {
  return canonicalSelectedCropName(name) !== null;
}

