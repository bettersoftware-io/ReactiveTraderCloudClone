import { useCallback } from "react";
import type { Dealer } from "@rtc/domain";

interface DealerSelectionProps {
  dealers: readonly Dealer[];
  selectedIds: Set<number>;
  onChange: (ids: Set<number>) => void;
}

export function DealerSelection({ dealers, selectedIds, onChange }: DealerSelectionProps) {
  const toggle = useCallback(
    (id: number) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onChange(next);
    },
    [selectedIds, onChange],
  );

  return (
    <div>
      <label style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>
        Dealers
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 150, overflow: "auto" }}>
        {dealers.map((dealer) => (
          <label
            key={dealer.id}
            style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-primary)", cursor: "pointer" }}
          >
            <input
              type="checkbox"
              checked={selectedIds.has(dealer.id)}
              onChange={() => toggle(dealer.id)}
            />
            {dealer.name}
          </label>
        ))}
      </div>
    </div>
  );
}
