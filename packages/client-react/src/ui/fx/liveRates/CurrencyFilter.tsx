import { CURRENCY_CATEGORIES, type CurrencyCategory } from "@rtc/domain";

import styles from "./CurrencyFilter.module.css";

interface CurrencyFilterProps {
  selected: CurrencyCategory;
  onChange: (category: CurrencyCategory) => void;
}

export function CurrencyFilter({ selected, onChange }: CurrencyFilterProps) {
  return (
    <div data-testid="currency-filter" className={styles.filterBar}>
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
            className={styles.filter}
          >
            {cat}
          </button>
        );
      })}
    </div>
  );
}
