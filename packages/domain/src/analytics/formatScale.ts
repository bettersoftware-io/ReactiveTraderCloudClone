// Pure re-implementation of the original number-scaling helpers.
// See rtc-original@4a31f01 utils/formatNumber.ts:37-57 (scaleNumber),
// :144-147 (formatWithScale), :136 (formatAsWholeNumber), :95-99 (precision).

import { wholeNumberFormat } from "./numberFormat.js";

export type Scale = "k" | "m" | "b" | "t" | "";

export interface ScaledNumber {
  value: number;
  scale: Scale;
}

const k = 1_000;
const m: number = k * k;
const b: number = m * k;
const t: number = b * k;

const precise2 = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function scaleNumber(value: number): ScaledNumber {
  const magnitude = Math.abs(value);
  if (magnitude >= t) return { value: value / t, scale: "t" };
  if (magnitude >= b) return { value: value / b, scale: "b" };
  if (magnitude >= m) return { value: value / m, scale: "m" };
  if (magnitude >= k) return { value: value / k, scale: "k" };
  return { value, scale: "" };
}

/**
 * Original `formatWithScale(value, formatAsWholeNumber)`: scale the number,
 * format the mantissa as a whole number (comma grouping, rounding), then
 * append the scale suffix. e.g. 1234 -> "1k", 12345678 -> "12m", 565 stays "565".
 */
export function formatWithScale(value: number): string {
  const { value: scaled, scale } = scaleNumber(value);
  return wholeNumberFormat.format(scaled) + scale;
}

/** Original `precisionNumberFormatter(2)`: 2 fraction digits, comma grouping. */
export function formatPrecise2(value: number): string {
  return precise2.format(value);
}
