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
  depth(symbol: string): Observable<DepthBook>;
}
