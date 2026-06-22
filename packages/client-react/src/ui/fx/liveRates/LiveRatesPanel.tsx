import { type CurrencyCategory, matchesCurrencyFilter } from "@rtc/domain";
import { useMemo, useState } from "react";
import styles from "./LiveRatesPanel.module.css";
import { useHooks } from "../../hooks/useHooks";
import { CurrencyFilter } from "./CurrencyFilter";
import { Tile } from "./tile/Tile";
import { ViewToggle } from "./ViewToggle";

export function LiveRatesPanel() {
  const hooks = useHooks();
  const pairs = hooks.useCurrencyPairs();
  // ViewMode persistence lives behind the seam (PreferencesPort). The category
  // filter stays local — it's transient view state, not a persisted preference.
  const { viewMode, setViewMode } = hooks.useViewModePreference();
  const [filter, setFilter] = useState<CurrencyCategory>("All");

  const filteredPairs = useMemo(
    () => pairs.filter((p) => matchesCurrencyFilter(p.symbol, filter)),
    [pairs, filter],
  );

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
          {filteredPairs.map((pair) => (
            <Tile
              key={pair.symbol}
              pair={pair}
              showChart={viewMode === "chart"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
