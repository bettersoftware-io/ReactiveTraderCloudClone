import { type Observable, shareReplay } from "rxjs";

import type { Candle, CandleTimeframe, MarketDataPort } from "@rtc/domain";

const DEFAULT_TIMEFRAME: CandleTimeframe = "1D";

export class CandleSeriesPresenter {
  private readonly candleCache = new Map<
    string,
    Observable<readonly Candle[]>
  >();

  constructor(private readonly marketData: MarketDataPort) {}

  candles$(
    symbol: string,
    timeframe: CandleTimeframe = DEFAULT_TIMEFRAME,
  ): Observable<readonly Candle[]> {
    const key = `${symbol}|${timeframe}`;
    const cached = this.candleCache.get(key);
    if (cached) return cached;
    const stream = this.marketData
      .candles(symbol, timeframe)
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
    this.candleCache.set(key, stream);
    return stream;
  }
}
