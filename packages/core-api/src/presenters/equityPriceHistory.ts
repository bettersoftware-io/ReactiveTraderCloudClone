import type { EquityQuote } from "@rtc/domain";

import type { Stream } from "#/stream";

/** Per-symbol rolling windows of live equity quotes backing the movers
 * sparklines — the equities twin of `PriceHistoryPresenter`. A remounted row
 * re-reads its accumulated window rather than restarting from an empty
 * buffer. Unseeded: a never-mounted symbol emits nothing until its first
 * quote. */
export interface EquityPriceHistoryPresenter {
  history$(symbol: string): Stream<readonly EquityQuote[]>;
}
