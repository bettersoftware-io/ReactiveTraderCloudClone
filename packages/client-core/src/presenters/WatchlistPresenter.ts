import { type Observable, shareReplay } from "rxjs";

import type {
  EquityInstrument,
  EquityQuote,
  MarketDataPort,
} from "@rtc/domain";

import { warmReplay } from "./warmReplay.js";

export class WatchlistPresenter {
  private readonly quoteCache = new Map<string, Observable<EquityQuote>>();

  readonly watchlist$: Observable<readonly EquityInstrument[]>;

  constructor(private readonly marketData: MarketDataPort) {
    // Singleton (one watchlist per connection) → warm across tab remounts.
    this.watchlist$ = this.marketData.watchlist().pipe(warmReplay());
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
