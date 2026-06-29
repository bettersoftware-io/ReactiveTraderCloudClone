import type { Observable } from "rxjs";

import type { Candle } from "../equities/candle.js";
import type { DepthBook } from "../equities/depth.js";
import type { EquityInstrument } from "../equities/instrument.js";
import type { EquityQuote } from "../equities/quote.js";

export interface MarketDataPort {
  watchlist(): Observable<readonly EquityInstrument[]>;
  quotes(symbol: string): Observable<EquityQuote>;
  candles(symbol: string): Observable<readonly Candle[]>;
  depth(symbol: string): Observable<DepthBook>;
}
