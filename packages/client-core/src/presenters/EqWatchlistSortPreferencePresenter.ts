import { type Observable, shareReplay, take } from "rxjs";

import {
  DEFAULT_EQ_WATCHLIST_SORT,
  type EqWatchlistSort,
  nextEqWatchlistSort,
  type PreferencesPort,
} from "@rtc/domain";

/**
 * App-layer presenter for the equities watchlist sort-mode preference.
 * Exposes the replay-current sort stream, the write operation, and a cycle()
 * (the Watchlist head's ⇅ button advances sym → chg → price → sym), keeping
 * persistence out of the UI. Mirrors ThemePreferencePresenter's cycle().
 */
export class EqWatchlistSortPreferencePresenter {
  readonly sort$: Observable<EqWatchlistSort>;

  constructor(private readonly preferences: PreferencesPort) {
    this.sort$ = preferences
      .eqWatchlistSort$()
      .pipe(shareReplay({ bufferSize: 1, refCount: true }));
  }

  setSort(sort: EqWatchlistSort): void {
    this.preferences.setEqWatchlistSort(sort);
  }

  /** Advance the stored sort one step in the cycle (sym → chg → price → sym).
   * Reads the CURRENT persisted sort synchronously (eqWatchlistSort$ is
   * replay-current) rather than from a caller's captured value, so rapid
   * successive clicks each advance from the true state. */
  cycle(): void {
    let current: EqWatchlistSort = DEFAULT_EQ_WATCHLIST_SORT;
    this.preferences
      .eqWatchlistSort$()
      .pipe(take(1))
      .subscribe((s) => {
        current = s;
      });
    this.setSort(nextEqWatchlistSort(current));
  }
}
