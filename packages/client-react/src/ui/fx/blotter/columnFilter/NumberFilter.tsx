import type { Trade } from "@rtc/domain";
import { useCallback, useState } from "react";
import styles from "./NumberFilter.module.css";
import type { ColumnFilter, Comparator } from "./filterState";

interface NumberFilterProps {
  column: keyof Trade;
  currentFilter: ColumnFilter | undefined;
  onApply: (filter: ColumnFilter | null) => void;
}

const comparators: { value: Comparator; label: string }[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equal" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equals" },
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equals" },
  { value: "inRange", label: "In range" },
];

export function NumberFilter({
  column,
  currentFilter,
  onApply,
}: NumberFilterProps) {
  const [comparator, setComparator] = useState<Comparator>(
    currentFilter?.type === "number" ? currentFilter.comparator : "eq",
  );
  const [value, setValue] = useState(
    currentFilter?.type === "number" ? String(currentFilter.value) : "",
  );
  const [valueTo, setValueTo] = useState(
    currentFilter?.type === "number" && currentFilter.valueTo != null
      ? String(currentFilter.valueTo)
      : "",
  );

  const handleApply = useCallback(() => {
    const num = parseFloat(value);
    if (Number.isNaN(num)) {
      onApply(null);
      return;
    }
    const numTo = comparator === "inRange" ? parseFloat(valueTo) : undefined;
    onApply({
      type: "number",
      column,
      comparator,
      value: num,
      valueTo: numTo !== undefined && !Number.isNaN(numTo) ? numTo : undefined,
    });
  }, [column, comparator, value, valueTo, onApply]);

  return (
    <div className={styles.container}>
      <select
        data-testid="number-filter-comparator"
        value={comparator}
        onChange={(e) => setComparator(e.target.value as Comparator)}
        className={styles.select}
      >
        {comparators.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        data-testid="number-filter-value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Value"
        className={styles.input}
      />
      {comparator === "inRange" && (
        <input
          type="number"
          data-testid="number-filter-value-to"
          value={valueTo}
          onChange={(e) => setValueTo(e.target.value)}
          placeholder="To"
          className={styles.input}
        />
      )}
      <div className={styles.buttons}>
        <button
          type="button"
          data-testid="number-filter-apply"
          onClick={handleApply}
          className={styles.applyBtn}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => onApply(null)}
          className={styles.resetBtn}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
