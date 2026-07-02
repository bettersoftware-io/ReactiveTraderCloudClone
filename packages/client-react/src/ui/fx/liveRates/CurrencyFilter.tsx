import type { ReactElement } from "react";

import { CURRENCY_CATEGORIES, type CurrencyCategory } from "@rtc/domain";

import styles from "./CurrencyFilter.module.css";

export function CurrencyFilter({
  selected,
  onChange,
}: CurrencyFilterProps): ReactElement {
  return (
    <div data-testid="currency-filter" className={styles.filterBar}>
      <span className={styles.label}>FILTER</span>
      {CURRENCY_CATEGORIES.map((cat) => {
        return (
          <button
            key={cat}
            type="button"
            data-testid={`filter-${cat}`}
            data-active={selected === cat ? "true" : "false"}
            onClick={() => {
              return onChange(cat);
            }}
            className={styles.chip}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}

interface CurrencyFilterProps {
  selected: CurrencyCategory;
  onChange: (category: CurrencyCategory) => void;
}
