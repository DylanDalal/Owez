/** Small formatting helpers shared across UI components. */

export function centsToDisplay(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/** Parse a user-typed dollar string ("12.34", "$12", "12") into cents. */
export function dollarInputToCents(value: string): number {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return 0;
  const n = Number(cleaned);
  if (Number.isNaN(n)) return 0;
  return Math.round(n * 100);
}
