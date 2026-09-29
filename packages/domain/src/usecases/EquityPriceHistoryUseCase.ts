import { defer, type Observable } from "rxjs";
import { map } from "rxjs/operators";

import {
  EQUITY_PRICE_HISTORY_SIZE,
  type EquityQuote,
} from "../equities/quote.js";
import type { MarketDataPort } from "../ports/marketDataPort.js";

/** The equities twin of `PriceHistoryUseCase`: folds live quotes for one
 * symbol into a rolling window capped at `EQUITY_PRICE_HISTORY_SIZE`.
 * Deliberately unseeded, as FX is — the window starts empty and fills from
 * the live stream. */
export class EquityPriceHistoryUseCase {
  constructor(private readonly marketData: MarketDataPort) {}

  /**
   * `window` is the mutable accumulation buffer. It defaults to a fresh
   * array (cold semantics). A caller that needs the window to SURVIVE a
   * resubscription — a movers row that unmounts and later remounts — passes
   * a persistent array it owns, and the fold keeps appending to it. The cap
   * is applied here either way, so a supplied window can never grow
   * unbounded.
   */
  execute(
    symbol: string,
    window: EquityQuote[] = [],
  ): Observable<readonly EquityQuote[]> {
    return defer(() => {
      return this.marketData.quotes(symbol).pipe(
        map((quote) => {
          window.push(quote);

          if (window.length > EQUITY_PRICE_HISTORY_SIZE) {
            window.shift();
          }

          return [...window];
        }),
      );
    });
  }
}
