import { type Observable, shareReplay } from "rxjs";

import type { EqWatchlistSortPreferencePresenter as EqWatchlistSortPreferencePresenterApi } from "@rtc/core-api";
import {
  DEFAULT_EQ_WATCHLIST_SORT,
  type EqWatchlistSort,
  nextEqWatchlistSort,
  type PreferencesPort,
} from "@rtc/domain";

import { readNow } from "./readNow";

/**
 * App-layer presenter for the equities watchlist sort-mode preference.
 * Exposes the replay-current sort stream, the write operation, and a cycle()
 * (the Watchlist head's ⇅ button advances sym → chg → price → sym), keeping
 * persistence out of the UI. Mirrors ThemePreferencePresenter's cycle().
 */
export class EqWatchlistSortPreferencePresenter
  implements EqWatchlistSortPreferencePresenterApi
{
  readonly sort$: Observable<EqWatchlistSort>;

  /** The port's stream, captured once at construction — `cycle()` reads
   * through a fresh subscription of THIS Observable rather than a fresh call
   * of `preferences.eqWatchlistSort$()`, so the port method is called once
   * regardless of how many times cycle() runs. */
  private readonly eqWatchlistSort$: Observable<EqWatchlistSort>;

  constructor(private readonly preferences: PreferencesPort) {
    this.eqWatchlistSort$ = preferences.eqWatchlistSort$();
    this.sort$ = this.eqWatchlistSort$.pipe(
      shareReplay({ bufferSize: 1, refCount: true }),
    );
  }

  setSort(sort: EqWatchlistSort): void {
    this.preferences.setEqWatchlistSort(sort);
  }

  /** Advance the stored sort one step in the cycle (sym → chg → price → sym).
   * Reads the CURRENT persisted sort synchronously (eqWatchlistSort$ is
   * replay-current) rather than from a caller's captured value, so rapid
   * successive clicks each advance from the true state. */
  cycle(): void {
    this.setSort(
      nextEqWatchlistSort(
        readNow(this.eqWatchlistSort$, DEFAULT_EQ_WATCHLIST_SORT),
      ),
    );
  }
}
