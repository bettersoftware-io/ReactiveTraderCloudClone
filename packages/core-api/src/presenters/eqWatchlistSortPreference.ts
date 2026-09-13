import type { EqWatchlistSort } from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The equities watchlist sort-mode preference: the replay-current sort stream,
 * the write operation, and a `cycle()` (the Watchlist head's ⇅ button advances
 * sym → chg → price → sym).
 */
export interface EqWatchlistSortPreferencePresenter {
  readonly sort$: Stream<EqWatchlistSort>;
  setSort(sort: EqWatchlistSort): void;
  /** Advance the stored sort one step in the cycle (sym → chg → price → sym).
   * Reads the CURRENT persisted sort rather than a caller's captured value, so
   * rapid successive clicks each advance from the true state. */
  cycle(): void;
}
