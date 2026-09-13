import type { Candle, CandleTimeframe } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Per-(symbol, timeframe) candle series with older-page backfill. */
export interface CandleSeriesPresenter {
  candles$(
    symbol: string,
    timeframe?: CandleTimeframe,
  ): Stream<readonly Candle[]>;
  /** Fetches one older page for the key and prepends it — the near-edge
   * trigger's intent. Single-flight; a no-op while a page is in flight, after
   * exhaustion, before `candles$` has ever emitted, or within the retry
   * cooldown of the last error. A SHORT page latches exhaustion; an error
   * clears the in-flight flag WITHOUT latching, so a trigger after the
   * cooldown retries. */
  loadOlder(symbol: string, timeframe?: CandleTimeframe): void;
  loadingOlder$(symbol: string, timeframe?: CandleTimeframe): Stream<boolean>;
  historyExhausted$(
    symbol: string,
    timeframe?: CandleTimeframe,
  ): Stream<boolean>;
}
