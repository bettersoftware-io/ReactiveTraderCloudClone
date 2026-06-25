// Mirrors the original client's formatAsWholeNumber = precisionNumberFormatter(0):
// Intl.NumberFormat with 0 fraction digits (comma grouping, rounding).
// See rtc-original@4a31f01 utils/formatNumber.ts:95-99,136 and
// App/Analytics/ProfitAndLoss/LastPosition.tsx:16.
const wholeNumber = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Formats a P&L value the way the original "last position" figure does:
 * a leading "+" for non-negative values (negatives carry their own "-"),
 * then the value as a whole number with locale comma grouping.
 */
export function formatPnlValue(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${wholeNumber.format(value)}`;
}
