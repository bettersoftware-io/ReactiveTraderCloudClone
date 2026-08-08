import type { ReactElement } from "react";

import styles from "./TimeframePills.module.css";

/**
 * The comparison-symbol picker: a "VS" group label + one pill per watchlist
 * symbol other than the selected one (max 4 on the 5-symbol roster).
 * Single-select — clicking the active pill clears the comparison. Reuses
 * TimeframePills' module-css shape, like IndicatorPills.
 */
export function ComparePills({
  candidates,
  active,
  onSelect,
}: ComparePillsProps): ReactElement {
  return (
    <div className={styles.pills}>
      <span className={styles.vsLabel}>VS</span>
      {candidates.map((sym) => {
        return (
          <button
            key={sym}
            type="button"
            className={styles.pill}
            data-testid="chart-compare-pill"
            data-sym={sym}
            data-active={String(active === sym)}
            onClick={() => {
              onSelect(active === sym ? null : sym);
            }}
          >
            {sym}
          </button>
        );
      })}
    </div>
  );
}

export interface ComparePillsProps {
  /** Watchlist symbols eligible for comparison — the selected symbol is
   * already excluded by the caller (EqChartHead). */
  candidates: readonly string[];
  /** The currently-compared symbol, or null for none. */
  active: string | null;
  /** Sets (or clears, on null) the comparison symbol. */
  onSelect: (sym: string | null) => void;
}
