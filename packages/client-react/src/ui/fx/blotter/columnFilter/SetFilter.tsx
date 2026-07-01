import type { ReactElement } from "react";
import { useState } from "react";

import type { ColumnFilter } from "./filterState";

import styles from "./SetFilter.module.css";

export function SetFilter<TRow>({
  column,
  rows,
  currentFilter,
  onApply,
}: SetFilterProps<TRow>): ReactElement {
  const valSet = new Set<string>();

  for (const row of rows) {
    valSet.add(String(row[column]));
  }

  const allValues = [...valSet].sort();

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (currentFilter?.type === "set") return new Set(currentFilter.values);
    return new Set(allValues);
  });

  function toggleValue(val: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  }

  function handleApply(): void {
    if (selected.size === allValues.length) {
      onApply(null); // all selected = no filter
    } else {
      onApply({ type: "set", column, values: selected });
    }
  }

  return (
    <div className={styles.container}>
      {allValues.map((val) => {
        return (
          <label key={val} className={styles.option}>
            <input
              type="checkbox"
              data-testid={`set-filter-option-${val}`}
              checked={selected.has(val)}
              onChange={() => {
                return toggleValue(val);
              }}
            />
            {val}
          </label>
        );
      })}
      <button
        type="button"
        data-testid="set-filter-apply"
        onClick={handleApply}
        className={styles.applyBtn}
      >
        Apply
      </button>
    </div>
  );
}

interface SetFilterProps<TRow> {
  column: keyof TRow;
  rows: readonly TRow[];
  currentFilter: ColumnFilter<TRow> | undefined;
  onApply: (filter: ColumnFilter<TRow> | null) => void;
}
