import { aggregatePositionsByCurrency } from "./aggregatePositions.js";
import type { CurrencyPairPosition } from "./position.js";

export interface CurrencyExposure {
  readonly currency: string;
  readonly amountMillions: number;
}

/**
 * PROTO net-exposure view of the book (dc.html L1300): per-currency net
 * traded amount in millions, one decimal. Aggregation semantics (base amount
 * -> base ccy, counter amount -> terms ccy, zero nets dropped, insertion
 * order) come from aggregatePositionsByCurrency.
 */
export function netExposureByCurrency(
  positions: readonly CurrencyPairPosition[],
): readonly CurrencyExposure[] {
  return aggregatePositionsByCurrency(positions).map((node) => {
    return {
      currency: node.currency,
      amountMillions: Math.round(node.tradedAmount / 100_000) / 10,
    };
  });
}
