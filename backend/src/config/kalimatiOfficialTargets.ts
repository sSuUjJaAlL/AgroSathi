import { COMMODITY_NEPALI, SELECTED_CROPS, normCommodityKey, type SelectedCrop } from "./selectedCrops.js";

/** Official Kalimati price-history dropdown labels per selected commodity (exact Nepali from site). */
export type KalimatiOfficialTarget = {
  commodityEnglish: SelectedCrop;
  commodityNepali: string;
  /** Labels as they appear in `#commodity_selector` on kalimatimarket.gov.np/price-history */
  optionLabelCandidates: string[];
};

export const KALIMATI_OFFICIAL_TARGETS: KalimatiOfficialTarget[] = [
  {
    commodityEnglish: "Apple (Fuji)",
    commodityNepali: COMMODITY_NEPALI["Apple (Fuji)"],
    optionLabelCandidates: ["स्याउ(फूजी)", "स्याउ (फूजी)", "स्याउ (फुजी)", "स्याउ(फुजी)"],
  },
  {
    commodityEnglish: "Lemon",
    commodityNepali: COMMODITY_NEPALI.Lemon,
    optionLabelCandidates: ["कागती"],
  },
  {
    commodityEnglish: "Ginger",
    commodityNepali: COMMODITY_NEPALI.Ginger,
    optionLabelCandidates: ["अदुवा"],
  },
  {
    commodityEnglish: "Carrot (Local)",
    commodityNepali: COMMODITY_NEPALI["Carrot (Local)"],
    optionLabelCandidates: ["गाजर(लोकल)", "गाजर (लोकल)"],
  },
  {
    commodityEnglish: "Garlic green",
    commodityNepali: COMMODITY_NEPALI["Garlic green"],
    optionLabelCandidates: ["लसुन हरियो", "हरियो लसुन"],
  },
  {
    commodityEnglish: "Dry chilli",
    commodityNepali: COMMODITY_NEPALI["Dry chilli"],
    optionLabelCandidates: ["खुर्सानी सुकेको", "खु्र्सानी सुकेको", "खुर्सानी सुक्केको"],
  },
  {
    commodityEnglish: "Red potato (round)",
    commodityNepali: COMMODITY_NEPALI["Red potato (round)"],
    optionLabelCandidates: ["रातो आलु(गोलो)", "रातो आलु (गोलो)"],
  },
  {
    commodityEnglish: "Tomato small (local)",
    commodityNepali: COMMODITY_NEPALI["Tomato small (local)"],
    optionLabelCandidates: ["गोलभेडा सानो(लोकल)", "गोलभेडा सानो (लोकल)"],
  },
];

export function resolveOfficialCommodityId(
  labelToId: Map<string, string>,
  target: KalimatiOfficialTarget
): { id: string; matchedLabel: string } | null {
  for (const candidate of target.optionLabelCandidates) {
    const direct = labelToId.get(candidate);
    if (direct) return { id: direct, matchedLabel: candidate };
  }
  const want = new Set(target.optionLabelCandidates.map((c) => normCommodityKey(c)));
  for (const [label, id] of labelToId) {
    if (want.has(normCommodityKey(label))) return { id, matchedLabel: label };
  }
  return null;
}

export function assertAllTargetsResolvable(labelToId: Map<string, string>): void {
  const missing: string[] = [];
  for (const t of KALIMATI_OFFICIAL_TARGETS) {
    if (!resolveOfficialCommodityId(labelToId, t)) {
      missing.push(`${t.commodityEnglish} (${t.optionLabelCandidates.join(" | ")})`);
    }
  }
  if (missing.length) {
    throw new Error(
      `Could not resolve Kalimati commodity IDs for:\n${missing.join("\n")}\n` +
        "Check option labels on https://kalimatimarket.gov.np/price-history"
    );
  }
}
