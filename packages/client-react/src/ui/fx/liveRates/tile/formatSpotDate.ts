const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/**
 * Formats a spot-value date `offsetDays` ahead of `from` as "DD MMM"
 * (e.g. "04 Jul"). Pure/UTC-based so the result is independent of the host
 * machine's local timezone.
 */
export function formatSpotDate(from: Date, offsetDays: number): string {
  const spot = new Date(from.getTime());
  spot.setUTCDate(spot.getUTCDate() + offsetDays);
  const day = String(spot.getUTCDate()).padStart(2, "0");
  return `${day} ${MONTHS[spot.getUTCMonth()]}`;
}
