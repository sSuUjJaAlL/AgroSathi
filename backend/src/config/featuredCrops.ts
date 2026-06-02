import { SELECTED_CROPS } from "./selectedCrops.js";

export const FEATURED_CROP_KEYWORDS = SELECTED_CROPS;

export function isFeaturedCrop(itemName: string): boolean {
  return FEATURED_CROP_KEYWORDS.includes(itemName as (typeof FEATURED_CROP_KEYWORDS)[number]);
}
