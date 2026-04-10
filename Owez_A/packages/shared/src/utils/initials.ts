/**
 * Derive 1–3 initials from a free-text name. Uses the first letter of every
 * whitespace-separated word, uppercased. Returns empty string for empty input.
 */
export function initialsFromName(name: string): string {
  if (!name) return '';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .filter(Boolean);
  if (parts.length === 0) return '';
  // Cap at 3 for visual balance (e.g. "Jane Mary Doe" -> "JMD")
  return parts.slice(0, 3).join('');
}
