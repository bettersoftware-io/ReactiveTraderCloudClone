import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";

import type { Trade } from "@rtc/domain";

import type { ColumnFilter } from "./filterState";

import styles from "./SetFilter.module.css";

interface SetFilterProps {
  column: keyof Trade;
  trades: readonly Trade[];
  currentFilter: ColumnFilter | undefined;
  onApply: (filter: ColumnFilter | null) => void;
}

export function SetFilter({
  column,
  trades,
  currentFilter,
  onApply,
}: SetFilterProps): ReactElement {
  const allValues = useMemo(() => {
    const vals = new Set<string>();
    for (const trade of trades) vals.add(String(trade[column]));
    return [...vals].sort();
  }, [trades, column]);

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (currentFilter?.type === "set") return new Set(currentFilter.values);
    return new Set(allValues);
  });

  const toggleValue = useCallback((val: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(val)) next.delete(val);
      else next.add(val);
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    if (selected.size === allValues.length) {
      onApply(null); // all selected = no filter
    } else {
      onApply({ type: "set", column, values: selected });
    }
  }, [selected, allValues.length, onApply, column]);

  return (
    <div className={styles.container}>
      {allValues.map((val) => {
        return (
          <label key={val} className={styles.option}>
            <input
              type="checkbox"
              checked={selected.has(val)}
              onChange={() => {
                return toggleValue(val);
              }}
            />
            {val}
          </label>
        );
      })}
      <button type="button" onClick={handleApply} className={styles.applyBtn}>
        Apply
      </button>
    </div>
  );
}
