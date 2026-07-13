import type { JSX } from "solid-js";
import { For } from "solid-js";

import { CURRENCY_CATEGORIES, type CurrencyCategory } from "@rtc/domain";

import styles from "./CurrencyFilter.module.css";

export function CurrencyFilter(props: CurrencyFilterProps): JSX.Element {
  return (
    <div data-testid="currency-filter" class={styles.filterBar}>
      <span class={styles.label}>FILTER</span>
      <For each={CURRENCY_CATEGORIES}>
        {(cat: CurrencyCategory) => {
          return (
            <button
              type="button"
              data-testid={`filter-${cat}`}
              data-active={props.selected === cat ? "true" : "false"}
              onClick={() => {
                props.onChange(cat);
              }}
              class={styles.chip}
            >
              {cat}
            </button>
          );
        }}
      </For>
    </div>
  );
}

interface CurrencyFilterProps {
  selected: CurrencyCategory;
  onChange: (category: CurrencyCategory) => void;
}
