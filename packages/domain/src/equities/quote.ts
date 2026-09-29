export interface EquityQuote {
  readonly symbol: string;
  readonly bid: number;
  readonly ask: number;
  readonly last: number;
  readonly changePct: number;
  readonly timestamp: number;
}

/** Points in an equity's rolling price window (`presenters.equityPriceHistory`,
 * the movers sparkline). The mobile-v1 prototype keeps exactly this many —
 * `[...s.hist, px].slice(-25)`, `Reactive Trader Mobile.dc.html:2262`. At the
 * simulator's 500 ms tick a cold window fills in about 12 s. */
export const EQUITY_PRICE_HISTORY_SIZE = 25;
