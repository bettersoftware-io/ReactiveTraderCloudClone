import type {
  BootPreferencePresenter,
  EqWatchlistSortPreferencePresenter,
} from "@rtc/core-api";
import {
  type BootVariant,
  DEFAULT_BOOT_VARIANT,
  DEFAULT_EQ_WATCHLIST_SORT,
  type EqWatchlistSort,
  nextEqWatchlistSort,
  type PreferencesPort,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { peek } from "#/bridge/peek";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

/** Presenters whose API includes a synchronous read of the STORED value.
 * Each read is a `peek` of a fresh port subscription (released before it
 * returns, so nothing is left warm) — never a value cached by the presenter,
 * so a write made behind the presenter's back is what the next read sees.
 * The same shape as `themePreference.cycle()`. */

/** No `host`: this presenter owns no stream, so nothing runs under the
 * Effect runtime — `current()` is a synchronous port read and `setVariant`
 * a synchronous port write. */
export function createBootPreferencePresenter(
  preferences: PreferencesPort,
): BootPreferencePresenter {
  // Called ONCE, here — every `current()` is a fresh SUBSCRIPTION of this
  // Observable, never a fresh call of the port method.
  const bootVariant = preferences.bootVariant$();

  return {
    current: () => {
      return peek(bootVariant, DEFAULT_BOOT_VARIANT);
    },
    setVariant: (variant: BootVariant) => {
      preferences.setBootVariant(variant);
    },
  };
}

export function createEqWatchlistSortPreferencePresenter(
  host: EffectHost,
  preferences: PreferencesPort,
): EqWatchlistSortPreferencePresenter {
  const sort = preferences.eqWatchlistSort$();

  return {
    sort$: mirrorPortAsIs(host, sort),
    setSort: (next: EqWatchlistSort) => {
      preferences.setEqWatchlistSort(next);
    },
    /** Advance from the TRUE stored value (sym → chg → price → sym), so rapid
     * successive clicks each advance from the real state. */
    cycle: () => {
      preferences.setEqWatchlistSort(
        nextEqWatchlistSort(peek(sort, DEFAULT_EQ_WATCHLIST_SORT)),
      );
    },
  };
}
