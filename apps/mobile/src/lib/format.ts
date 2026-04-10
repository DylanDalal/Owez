export function centsToDisplay(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

export function dollarInputToCents(value: string): number {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}

/** Tokens for consistent mobile styling — the RN counterpart to globals.css. */
export const colors = {
  ink: "#0B0F0D",
  paper: "#F7FBF9",
  accent: "#2EF2A3",
  mutedInk: "rgba(247,251,249,0.6)",
  dimInk: "rgba(247,251,249,0.4)",
  paperDim: "rgba(247,251,249,0.08)",
  danger: "#ff6b6b",
};
