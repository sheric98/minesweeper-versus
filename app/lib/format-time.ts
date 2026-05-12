/**
 * Format a duration in seconds as "M:SS" (e.g. 87 -> "1:27").
 * Sub-minute values render as "0:SS" for a consistent column width.
 * Returns "—" for null/undefined.
 */
export function formatSecondsAsMmSs(s: number | null | undefined): string {
  if (s === null || s === undefined) return "—";
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
