import { defer, type Observable, shareReplay, startWith } from "rxjs";

import type { EquityPriceHistoryPresenter as EquityPriceHistoryPresenterApi } from "@rtc/core-api";
import {
  EquityPriceHistoryUseCase,
  type EquityQuote,
  type MarketDataPort,
  PRICE_HISTORY_CONFLATION_MS,
} from "@rtc/domain";

import { conflateWhen } from "./conflateWhen";

/** The equities twin of `PriceHistoryPresenter` — same retention design, so
 * read that class's comments for the why. In short: the per-symbol WINDOW
 * ARRAY lives here and outlives every subscription, while the per-symbol
 * `quotes` subscription is ref-counted and released when the last row
 * unmounts; a remount repaints the retained window synchronously via an
 * outermost `startWith`. A never-mounted symbol has an empty window and so
 * emits nothing until its first quote.
 *
 * One window per symbol is kept for the presenter's lifetime and never
 * evicted. That is bounded by the watchlist roster (each at most
 * `EQUITY_PRICE_HISTORY_SIZE` quotes), exactly as the FX presenter is bounded
 * by the currency-pair list. */
export class EquityPriceHistoryPresenter
  implements EquityPriceHistoryPresenterApi
{
  private readonly cache = new Map<
    string,
    Observable<readonly EquityQuote[]>
  >();

  private readonly windows = new Map<string, EquityQuote[]>();

  constructor(
    private readonly marketData: MarketDataPort,
    private readonly powerSaver$: Observable<boolean>,
  ) {}

  history$(symbol: string): Observable<readonly EquityQuote[]> {
    const cached = this.cache.get(symbol);

    if (cached) {
      return cached;
    }

    let window = this.windows.get(symbol);

    if (!window) {
      window = [];
      this.windows.set(symbol, window);
    }

    const retained = window;
    const raw = new EquityPriceHistoryUseCase(this.marketData)
      .execute(symbol, retained)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));

    const shared = raw.pipe(
      conflateWhen(this.powerSaver$, PRICE_HISTORY_CONFLATION_MS),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    const stream = defer(() => {
      if (retained.length === 0) {
        return shared;
      }

      const seed: readonly EquityQuote[] = [...retained];
      return shared.pipe(startWith(seed));
    });
    this.cache.set(symbol, stream);
    return stream;
  }
}
