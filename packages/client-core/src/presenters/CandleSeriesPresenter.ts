import { type Observable, of, shareReplay } from "rxjs";

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

    if (cached) {
      return cached;
    }

    // An empty symbol is the eqWorkspace machine's transient "nothing
    // selected yet" state, not an actual unknown instrument — but
    // EquityMarketDataSimulator.candles() throws synchronously for any
    // symbol it doesn't recognise (a correct, tested domain contract for a
    // genuinely unknown symbol). Guard here instead of loosening that
    // contract: an empty series is a normal, renderable UI state, so this
    // never subscribes the port for "". Belt-and-braces alongside the
    // eqWorkspace first-render fix (createViewModel.ts) — this presenter
    // should never see "" in practice, but must not crash React if it ever
    // does.
    const stream = symbol
      ? this.marketData
          .candles(symbol, timeframe)
          .pipe(shareReplay({ bufferSize: 1, refCount: true }))
      : of([] as readonly Candle[]);
    this.candleCache.set(key, stream);
    return stream;
  }
}
