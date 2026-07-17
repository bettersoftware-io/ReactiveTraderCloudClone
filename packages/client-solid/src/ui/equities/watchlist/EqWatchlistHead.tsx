import type { JSX } from "solid-js";

import type { EqWatchlistSort } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "#/ui/shell/layout/engine/PanelHeadTabs.module.css";

/** The Watchlist panel's head slot: a static "☰ Watchlist" title plus the ⇅
 * sort-cycle chip (sym → chg → price → sym), driven by the shared
 * useEqWatchlistSort() preference so the head and WatchlistPanel body always
 * agree on the active mode. Mirrors LiveRatesHead/FxBlotterHead: renders
 * inside the panel header via InhouseLayoutEngine's headRegistry. */
export function EqWatchlistHead(): JSX.Element {
  const { useEqWatchlistSort } = useViewModel();
  const { sort, cycle } = useEqWatchlistSort();

  return (
    <div class={styles.headTabs}>
      <span class={styles.headTab} data-active="true">
        ☰ Watchlist
      </span>
      <span class={styles.headSpacer} />
      <button
        type="button"
        data-testid="watchlist-sort-cycle"
        data-active="true"
        class={styles.headChip}
        onClick={cycle}
      >
        <span aria-hidden="true">⇅ </span>
        {SORT_LABEL[sort()]}
      </button>
    </div>
  );
}

const SORT_LABEL: Record<EqWatchlistSort, string> = {
  sym: "A–Z",
  chg: "% CHG",
  price: "PRICE",
};
