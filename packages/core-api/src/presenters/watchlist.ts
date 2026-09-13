import type { EquityInstrument, EquityQuote } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The equities watchlist roster plus per-symbol quote streams. */
export interface WatchlistPresenter {
  readonly watchlist$: Stream<readonly EquityInstrument[]>;
  quote$(symbol: string): Stream<EquityQuote>;
}
