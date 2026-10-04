import { type Observable, shareReplay } from "rxjs";

import type { WatchlistPresenter as WatchlistPresenterApi } from "@rtc/core-api";
import type {
  EquityInstrument,
  EquityQuote,
  MarketDataPort,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class WatchlistPresenter implements WatchlistPresenterApi {
  private readonly quoteCache = new Map<string, Observable<EquityQuote>>();

  readonly watchlist$: Observable<readonly EquityInstrument[]>;

  /** `disposed$` emits once when the app is disposed (`app.dispose()`); it
   * releases this singleton's port subscription — see `warmReplay`. */
  constructor(
    private readonly marketData: MarketDataPort,
    disposed$: Observable<unknown>,
  ) {
    // Singleton (one watchlist per connection) → warm across tab remounts.
    this.watchlist$ = this.marketData.watchlist().pipe(warmReplay(disposed$));
  }

  quote$(symbol: string): Observable<EquityQuote> {
    const cached = this.quoteCache.get(symbol);

    if (cached) {
      return cached;
    }

    const stream = this.marketData
      .quotes(symbol)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.quoteCache.set(symbol, stream);
    return stream;
  }
}
