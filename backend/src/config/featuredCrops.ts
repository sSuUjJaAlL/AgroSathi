export const FEATURED_CROP_KEYWORDS = [
  "tomato",
  "potato",
  "onion",
  "cauliflower",
  "cabbage",
  "ginger",
  "garlic",
  "chilli",
  "carrot",
  "radish",
] as const;

export function isFeaturedCrop(itemName: string): boolean {
  const lower = itemName.toLowerCase();
  return FEATURED_CROP_KEYWORDS.some((kw) => lower.includes(kw));
}
