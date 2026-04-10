/** Round a number to two decimal places, avoiding floating-point drift */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return '$0.00';
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
