import type { ReactElement } from "react";

import type { EqIndicatorId } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The SMA20/EMA50 indicator-overlay toggles — a `TimeframePills` clone
 * (reuses its module-css shape verbatim), but each pill's active state is
 * independent (a toggle, not a mutually-exclusive selection). */
export function IndicatorPills({
  active,
  onToggle,
}: IndicatorPillsProps): ReactElement {
  return (
    <div className={styles.pills}>
      {INDICATORS.map((id) => {
        return (
          <button
            key={id.id}
            type="button"
            className={styles.pill}
            data-testid="chart-indicator-pill"
            data-ind={id.id}
            data-active={String(active.includes(id.id))}
            onClick={() => {
              onToggle(id.id);
            }}
          >
            {id.label}
          </button>
        );
      })}
    </div>
  );
}

interface IndicatorOption {
  id: EqIndicatorId;
  label: string;
}

const INDICATORS: readonly IndicatorOption[] = [
  { id: "sma20", label: "SMA 20" },
  { id: "ema50", label: "EMA 50" },
];

export interface IndicatorPillsProps {
  active: readonly EqIndicatorId[];
  onToggle: (id: EqIndicatorId) => void;
}
