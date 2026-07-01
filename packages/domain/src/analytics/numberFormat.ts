// Mirrors the original client's formatAsWholeNumber = precisionNumberFormatter(0):
// Intl.NumberFormat with 0 fraction digits (comma grouping, rounding).
// See rtc-original@4a31f01 utils/formatNumber.ts:95-99,136. Locale pinned to
// en-US so comma grouping is deterministic across the Node 26 CI/sandbox runtimes.
export const wholeNumberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
