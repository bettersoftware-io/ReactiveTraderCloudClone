import { wholeNumberFormat } from "./numberFormat.js";

/**
 * Formats a P&L value the way the original "last position" figure does:
 * a leading "+" for non-negative values (negatives carry their own "-"),
 * then the value as a whole number with locale comma grouping.
 * See rtc-original@4a31f01 App/Analytics/ProfitAndLoss/LastPosition.tsx:16.
 */
export function formatPnlValue(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${wholeNumberFormat.format(value)}`;
}
