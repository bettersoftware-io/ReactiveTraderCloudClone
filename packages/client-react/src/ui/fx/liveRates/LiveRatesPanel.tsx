import type { ReactElement } from "react";
import { useState } from "react";

import { type CurrencyCategory, matchesCurrencyFilter } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { useFlipGrid } from "#/ui/shell/motion/useFlipGrid";

import { CurrencyFilter } from "./CurrencyFilter";
import { Tile } from "./tile/Tile";
import { ViewToggle } from "./ViewToggle";

import styles from "./LiveRatesPanel.module.css";

export function LiveRatesPanel(): ReactElement {
  const { useCurrencyPairs, useViewModePreference } = useViewModel();
  const pairs = useCurrencyPairs();
  // ViewMode persistence lives behind the seam (PreferencesPort). The category
  // filter stays local — it's transient view state, not a persisted preference.
  const { viewMode, setViewMode } = useViewModePreference();
  const [filter, setFilter] = useState<CurrencyCategory>("All");

  const filteredPairs = pairs.filter((p) => {
    return matchesCurrencyFilter(p.symbol, filter);
  });

  // Tiles glide (FLIP) to their new grid position whenever the filter changes
  // which pairs are shown.
  const { register } = useFlipGrid([filter]);

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        <CurrencyFilter selected={filter} onChange={setFilter} />
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {pairs.length === 0 ? (
        <div className={styles.empty}>Loading currency pairs...</div>
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
