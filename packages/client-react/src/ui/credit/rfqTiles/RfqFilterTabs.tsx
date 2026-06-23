import type { ReactElement } from "react";

import styles from "./RfqFilterTabs.module.css";

export type RfqFilter = "Live" | "All" | "Done" | "Expired" | "Cancelled";

const FILTERS: RfqFilter[] = ["Live", "All", "Done", "Expired", "Cancelled"];

interface RfqFilterTabsProps {
  selected: RfqFilter;
  onChange: (filter: RfqFilter) => void;
}

export function RfqFilterTabs({
  selected,
  onChange,
}: RfqFilterTabsProps): ReactElement {
  return (
    <div className={styles.tabs}>
      {FILTERS.map((f) => {
        return (
          <button
            key={f}
            type="button"
            data-testid={`rfq-filter-${f}`}
            data-active={selected === f ? "true" : "false"}
            onClick={(): void => {
              onChange(f);
            }}
            className={styles.tab}
          >
            {f}
          </button>
        );
      })}
    </div>
  );
}
