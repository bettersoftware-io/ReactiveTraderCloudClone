import type { Observable } from "rxjs";

import type { Candle } from "../equities/candle.js";
import type { DepthBook } from "../equities/depth.js";
import type { EquityInstrument } from "../equities/instrument.js";
import type { EquityQuote } from "../equities/quote.js";
import type { CandleTimeframe } from "../equities/timeframe.js";

export interface MarketDataPort {
  watchlist(): Observable<readonly EquityInstrument[]>;
  quotes(symbol: string): Observable<EquityQuote>;
  /** Historical OHLC series for `symbol`. `timeframe` defaults to "1D" —
   * implementations must preserve their existing "1D" behaviour unchanged. */
  candles(
    symbol: string,
    timeframe?: CandleTimeframe,
  ): Observable<readonly Candle[]>;
  /** Up to `count` candles strictly BEFORE `beforeTime`, chronological, on
   * the same bucket grid as candles(). One-shot: emits once, completes. A
   * SHORT page (fewer than count, including empty) means start-of-history —
   * page length is the exhaustion signal; there is no hasMore field. */
  candleHistory(
    symbol: string,
    timeframe: CandleTimeframe,
    beforeTime: number,
    count: number,
  ): Observable<readonly Candle[]>;
  depth(symbol: string): Observable<DepthBook>;
}
