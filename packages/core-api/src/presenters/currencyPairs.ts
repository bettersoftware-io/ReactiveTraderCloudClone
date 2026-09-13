import type { CurrencyPair } from "@rtc/domain";

import type { Stream } from "#/stream";

/** The active currency-pair roster — replay-current, kept warm for the session. */
export interface CurrencyPairsPresenter {
  readonly pairs$: Stream<readonly CurrencyPair[]>;
}
