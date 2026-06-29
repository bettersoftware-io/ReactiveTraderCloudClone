import { type Observable, shareReplay } from "rxjs";

import type { Candle, MarketDataPort } from "@rtc/domain";

export class CandleSeriesPresenter {
  private readonly candleCache = new Map<
    string,
    Observable<readonly Candle[]>
  >();

  constructor(private readonly marketData: MarketDataPort) {}

  candles$(symbol: string): Observable<readonly Candle[]> {
    const cached = this.candleCache.get(symbol);
    if (cached) return cached;
    const stream = this.marketData
      .candles(symbol)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.candleCache.set(symbol, stream);
    return stream;
  }
}
