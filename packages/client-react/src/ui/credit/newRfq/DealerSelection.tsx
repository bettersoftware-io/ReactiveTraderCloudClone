import { useCallback } from "react";
import type { Dealer } from "@rtc/domain";
import styles from "./DealerSelection.module.css";

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
    <div className={styles.section}>
      <label className={styles.label}>
        Dealers
      </label>
      <div className={styles.list}>
        {dealers.map((dealer) => (
          <label
            key={dealer.id}
            className={styles.dealerLabel}
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
