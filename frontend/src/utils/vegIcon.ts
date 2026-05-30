/** Simple emoji icons for commodity rows (presentation-friendly). */
export function veggieIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("tomato")) return "🍅";
  if (n.includes("potato")) return "🥔";
  if (n.includes("onion")) return "🧅";
  if (n.includes("cabbage")) return "🥬";
  if (n.includes("cauli")) return "🥦";
  if (n.includes("bean")) return "🫘";
  if (n.includes("peas")) return "🟢";
  if (n.includes("carrot")) return "🥕";
  if (n.includes("garlic")) return "🧄";
  if (n.includes("ginger")) return "🫚";
  if (n.includes("spinach")) return "🍃";
  if (n.includes("apple")) return "🍎";
  if (n.includes("banana")) return "🍌";
  if (n.includes("chilli") || n.includes("chili")) return "🌶️";
  return "🥗";
}
