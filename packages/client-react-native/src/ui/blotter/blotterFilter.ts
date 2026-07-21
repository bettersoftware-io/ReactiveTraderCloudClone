import { Direction, type Trade } from "@rtc/domain";

export const BLOTTER_FILTERS = ["ALL", "DONE", "PENDING", "REJECTED"] as const;

export type BlotterFilter = (typeof BLOTTER_FILTERS)[number];

/** Prototype filter: ALL passes through; otherwise keep trades whose status
 * (upper-cased) matches the selected chip. */
export function filterTrades(
  trades: readonly Trade[],
  filter: BlotterFilter,
): readonly Trade[] {
  if (filter === "ALL") {
    return trades;
  }

  return trades.filter((t) => {
    return t.status.toUpperCase() === filter;
  });
}

export function summarize(trades: readonly Trade[]): BlotterSummary {
  let buys = 0;
  let sells = 0;

  for (const t of trades) {
    if (t.direction === Direction.Buy) {
      buys += 1;
    } else {
      sells += 1;
    }
  }

  return { fills: trades.length, buys, sells };
}

/** "EURUSD" -> "EUR/USD" */
export function formatPair(symbol: string): string {
  return `${symbol.slice(0, 3)}/${symbol.slice(3)}`;
}

/** JPY pairs display at 3dp; every other pair at 5dp. */
export function formatRate(spotRate: number, symbol: string): string {
  return spotRate.toFixed(symbol.includes("JPY") ? 3 : 5);
}

export interface BlotterSummary {
  readonly fills: number;
  readonly buys: number;
  readonly sells: number;
}
