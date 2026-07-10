import { deriveBaseTerm } from "../fx/currencyPair.js";
import type { CurrencyPairPosition } from "./position.js";

export const POSITION_MIN_RADIUS = 15;
export const POSITION_MAX_RADIUS = 60;

export interface CurrencyPositionNode {
  readonly currency: string;
  readonly tradedAmount: number;
  readonly radius: number;
  readonly sign: "pos" | "neg";
  readonly text: string;
}

// Mirrors the original formatAsWholeNumber (Intl 0-fraction, comma grouping).
const wholeNumber = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Per-currency aggregation matching rtc-original@4a31f01
 * App/Analytics/Positions/data.ts:46-99.
 *
 * For each pair, the base traded amount accrues to its base currency and the
 * counter traded amount to its counter currency. Currencies whose net traded
 * amount is zero are dropped. Radius is a linear scale of abs(tradedAmount)
 * over [minValue, maxValue] -> [15, 60], where minValue collapses to 0 when
 * all magnitudes are equal (original :73). Colour follows the sign of the net.
 */
export function aggregatePositionsByCurrency(
  positions: readonly CurrencyPairPosition[],
): readonly CurrencyPositionNode[] {
  const totals = new Map<string, number>();

  for (const p of positions) {
    const { base, terms } = deriveBaseTerm(p.symbol);
    totals.set(base, (totals.get(base) ?? 0) + p.baseTradedAmount);
    totals.set(terms, (totals.get(terms) ?? 0) + p.counterTradedAmount);
  }

  const data = [...totals.entries()]
    .map(([currency, tradedAmount]) => {
      return { currency, tradedAmount };
    })
    .filter((d) => {
      return d.tradedAmount !== 0;
    });

  const magnitudes = data.map((d) => {
    return Math.abs(d.tradedAmount);
  });
  const maxValue = magnitudes.length > 0 ? Math.max(...magnitudes) : 0;
  const rawMin = magnitudes.length > 0 ? Math.min(...magnitudes) : 0;
  const minValue = rawMin !== maxValue ? rawMin : 0;

  const span = maxValue - minValue;

  function scaleRadius(amount: number): number {
    if (span === 0) {
      return POSITION_MIN_RADIUS;
    }

    const fraction = (Math.abs(amount) - minValue) / span;
    return (
      POSITION_MIN_RADIUS +
      fraction * (POSITION_MAX_RADIUS - POSITION_MIN_RADIUS)
    );
  }

  return data.map((d) => {
    return {
      currency: d.currency,
      tradedAmount: d.tradedAmount,
      radius: scaleRadius(d.tradedAmount),
      sign: d.tradedAmount > 0 ? "pos" : "neg",
      text: wholeNumber.format(d.tradedAmount),
    };
  });
}
