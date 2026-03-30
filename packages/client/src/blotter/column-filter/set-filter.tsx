import { useCallback, useMemo, useState } from "react";
import type { Trade } from "@rtc/domain";
import type { ColumnFilter } from "./filter-state";

interface SetFilterProps {
  column: keyof Trade;
  trades: readonly Trade[];
  currentFilter: ColumnFilter | undefined;
  onApply: (filter: ColumnFilter | null) => void;
}

export function SetFilter({ column, trades, currentFilter, onApply }: SetFilterProps) {
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
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: 8 }}>
      {allValues.map((val) => (
        <label key={val} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={selected.has(val)}
            onChange={() => toggleValue(val)}
          />
          {val}
        </label>
      ))}
      <button
        onClick={handleApply}
        style={{
          marginTop: 4,
          padding: "4px 8px",
          fontSize: 11,
          border: "1px solid var(--border-primary)",
          borderRadius: 3,
          backgroundColor: "var(--accent-primary)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Apply
      </button>
    </div>
  );
}
