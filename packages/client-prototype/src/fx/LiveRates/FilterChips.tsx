import type { ReactElement } from "react";

import styles from "#/fx/LiveRates/FilterChips.module.css";

export type Filter = "All" | "EUR" | "USD" | "GBP" | "JPY" | "AUD";

export interface FilterChipsProps {
  value: Filter;
  onChange(f: Filter): void;
}

const FILTERS: Filter[] = ["All", "EUR", "USD", "GBP", "JPY", "AUD"];

export function FilterChips(props: FilterChipsProps): ReactElement {
  const { value, onChange } = props;

  function handleClick(f: Filter): void {
    // PROTO 1256: clicking the already-active chip is a no-op.
    if (f !== value) {
      onChange(f);
    }
  }

  return (
    <div className={styles.chips}>
      <span className={styles.label}>FILTER</span>
      {FILTERS.map((f) => {
        return (
          <button
            key={f}
            type="button"
            className={styles.chip}
            data-active={String(f === value)}
            onClick={() => {
              handleClick(f);
            }}
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}
