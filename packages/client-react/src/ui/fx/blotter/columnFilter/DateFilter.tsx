import type { ChangeEvent, ReactElement } from "react";
import { useCallback, useState } from "react";

import type { Trade } from "@rtc/domain";

import type { ColumnFilter, Comparator } from "./filterState";

import styles from "./DateFilter.module.css";

interface DateFilterProps {
  column: keyof Trade;
  currentFilter: ColumnFilter | undefined;
  onApply: (filter: ColumnFilter | null) => void;
}

interface ComparatorOption {
  value: Comparator;
  label: string;
}

const comparators: ComparatorOption[] = [
  { value: "eq", label: "Equals" },
  { value: "neq", label: "Not equal" },
  { value: "lt", label: "Less than" },
  { value: "lte", label: "Less than or equals" },
  { value: "gt", label: "Greater than" },
  { value: "gte", label: "Greater than or equals" },
  { value: "inRange", label: "In range" },
];

export function DateFilter({
  column,
  currentFilter,
  onApply,
}: DateFilterProps): ReactElement {
  const [comparator, setComparator] = useState<Comparator>(
    currentFilter?.type === "date" ? currentFilter.comparator : "eq",
  );
  const [value, setValue] = useState(
    currentFilter?.type === "date" ? currentFilter.value : "",
  );
  const [valueTo, setValueTo] = useState(
    currentFilter?.type === "date" && currentFilter.valueTo
      ? currentFilter.valueTo
      : "",
  );

  const handleApply = useCallback(() => {
    if (!value) {
      onApply(null);
      return;
    }

    onApply({
      type: "date",
      column,
      comparator,
      value,
      valueTo: comparator === "inRange" ? valueTo : undefined,
    });
  }, [column, comparator, value, valueTo, onApply]);

  return (
    <div className={styles.container}>
      <select
        data-testid="date-filter-comparator"
        value={comparator}
        onChange={(e: ChangeEvent<HTMLSelectElement>): void => {
          setComparator(e.target.value as Comparator);
        }}
        className={styles.select}
      >
        {comparators.map((c) => {
          return (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          );
        })}
      </select>
      <input
        type="date"
        data-testid="date-filter-value"
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>): void => {
          setValue(e.target.value);
        }}
        className={styles.input}
      />
      {comparator === "inRange" && (
        <input
          type="date"
          data-testid="date-filter-value-to"
          value={valueTo}
          onChange={(e: ChangeEvent<HTMLInputElement>): void => {
            setValueTo(e.target.value);
          }}
          className={styles.input}
        />
      )}
      <div className={styles.buttons}>
        <button
          type="button"
          data-testid="date-filter-apply"
          onClick={handleApply}
          className={styles.applyBtn}
        >
          Apply
        </button>
        <button
          type="button"
          onClick={() => {
            return onApply(null);
          }}
          className={styles.resetBtn}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
