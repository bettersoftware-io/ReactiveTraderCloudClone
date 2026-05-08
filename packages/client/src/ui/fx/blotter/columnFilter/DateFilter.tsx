import { useCallback, useState } from "react";
import type { Trade } from "@rtc/domain";
import type { ColumnFilter, Comparator } from "./filterState";

interface DateFilterProps {
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

export function DateFilter({ column, currentFilter, onApply }: DateFilterProps) {
  const [comparator, setComparator] = useState<Comparator>(
    currentFilter?.type === "date" ? currentFilter.comparator : "eq",
  );
  const [value, setValue] = useState(
    currentFilter?.type === "date" ? currentFilter.value : "",
  );
  const [valueTo, setValueTo] = useState(
    currentFilter?.type === "date" && currentFilter.valueTo ? currentFilter.valueTo : "",
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8 }}>
      <select
        value={comparator}
        onChange={(e) => setComparator(e.target.value as Comparator)}
        style={{ fontSize: 11, padding: 2, color: "var(--text-primary)", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
      >
        {comparators.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        style={{ fontSize: 11, padding: 2, color: "var(--text-primary)", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
      />
      {comparator === "inRange" && (
        <input
          type="date"
          value={valueTo}
          onChange={(e) => setValueTo(e.target.value)}
          style={{ fontSize: 11, padding: 2, color: "var(--text-primary)", backgroundColor: "var(--bg-secondary)", border: "1px solid var(--border-primary)" }}
        />
      )}
      <div style={{ display: "flex", gap: 4 }}>
        <button
          onClick={handleApply}
          style={{ flex: 1, padding: "4px 8px", fontSize: 11, border: "1px solid var(--border-primary)", borderRadius: 3, backgroundColor: "var(--accent-primary)", color: "#fff", cursor: "pointer" }}
        >
          Apply
        </button>
        <button
          onClick={() => onApply(null)}
          style={{ flex: 1, padding: "4px 8px", fontSize: 11, border: "1px solid var(--border-primary)", borderRadius: 3, backgroundColor: "transparent", color: "var(--text-secondary)", cursor: "pointer" }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
