import type { ReactElement } from "react";
import { useState } from "react";

import { type CurrencyCategory, matchesCurrencyFilter } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useFxView } from "#/ui/fx/useFxView";
import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

import { CurrencyFilter } from "./CurrencyFilter";
import { Tile } from "./tile/Tile";
import { WatchlistView } from "./WatchlistView";

import styles from "./LiveRatesPanel.module.css";

export function LiveRatesPanel(): ReactElement {
  const { useCurrencyPairs, useViewModePreference, usePowerSaver } =
    useViewModel();
  const pairs = useCurrencyPairs();
  const { isFreeze } = usePowerSaver();
  // ViewMode persistence lives behind the seam (PreferencesPort); the CHARTS
  // chip in LiveRatesHead is the only writer now (Task 11 moved it out of the
  // body). The category filter stays local — it's transient view state, not a
  // persisted preference.
  const { viewMode } = useViewModePreference();
  const { ratesTab } = useFxView();
  const [filter, setFilter] = useState<CurrencyCategory>("All");

  const filteredPairs = pairs.filter((p) => {
    return matchesCurrencyFilter(p.symbol, filter);
  });

  // Tiles glide (FLIP) to their new grid position whenever the filter changes
  // which pairs are shown; appearing tiles pop in, filtered-out ones fade out
  // in place (isotope-style).
  const { register } = useFlipGrid([filter], {
    enter: true,
    exit: true,
    freeze: isFreeze,
  });

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <CurrencyFilter selected={filter} onChange={setFilter} />
      </div>

      {pairs.length === 0 ? (
        <div className={styles.empty}>Loading currency pairs...</div>
      ) : ratesTab === "watchlist" ? (
        <WatchlistView pairs={filteredPairs} filter={filter} />
      ) : (
        <div className={styles.grid}>
          {filteredPairs.map((pair) => {
            return (
              <div
                key={pair.symbol}
                ref={register(pair.symbol)}
                className={styles.tileSlot}
              >
                <Tile pair={pair} showChart={viewMode === "chart"} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
