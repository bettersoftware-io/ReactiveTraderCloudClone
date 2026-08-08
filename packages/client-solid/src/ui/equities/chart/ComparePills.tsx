import { For, type JSX } from "solid-js";

import styles from "./TimeframePills.module.css";

/**
 * The comparison-symbol picker: a "VS" group label + one pill per watchlist
 * symbol other than the selected one (max 4 on the 5-symbol roster).
 * Single-select — clicking the active pill clears the comparison. Reuses
 * TimeframePills' module-css shape, like IndicatorPills.
 */
export function ComparePills(props: ComparePillsProps): JSX.Element {
  return (
    <div class={styles.pills}>
      <span class={styles.vsLabel}>VS</span>
      <For each={props.candidates}>
        {(sym: string): JSX.Element => {
          return (
            <button
              type="button"
              class={styles.pill}
              data-testid="chart-compare-pill"
              data-sym={sym}
              data-active={String(props.active === sym)}
              onClick={() => {
                props.onSelect(props.active === sym ? null : sym);
              }}
            >
              {sym}
            </button>
          );
        }}
      </For>
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
