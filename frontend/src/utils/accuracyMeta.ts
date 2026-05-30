export type AccuracyBand = "Excellent" | "Good" | "Fair" | "Needs More Data";

export function accuracyBand(pct: number | null): AccuracyBand {
  if (pct == null || Number.isNaN(pct)) return "Needs More Data";
  if (pct >= 97) return "Excellent";
  if (pct >= 93) return "Good";
  if (pct >= 88) return "Fair";
  return "Needs More Data";
}

export function bandVisual(band: AccuracyBand): { bar: string; badgeBg: string; badgeText: string } {
  switch (band) {
    case "Excellent":
      return { bar: "#1B4332", badgeBg: "#2D6A4F", badgeText: "#fff" };
    case "Good":
      return { bar: "#4895EF", badgeBg: "#4CC9F0", badgeText: "#0d1b2a" };
    case "Fair":
      return { bar: "#FFB703", badgeBg: "#FFB703", badgeText: "#1a1a1a" };
    default:
      return { bar: "#E63946", badgeBg: "#dc3545", badgeText: "#fff" };
  }
}
