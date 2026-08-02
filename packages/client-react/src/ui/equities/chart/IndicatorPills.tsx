import type { ReactElement } from "react";

import type { EqIndicatorId, EqPaneId } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The SMA20/EMA50 overlay toggles, plus the RSI/MACD indicator-pane
 * toggles — a `TimeframePills` clone (reuses its module-css shape
 * verbatim), but every pill's active state is independent (a toggle, not a
 * mutually-exclusive selection). The two groups are separate toggle sets
 * (an overlay and a pane can both be active for the same indicator name)
 * sharing one pill row, split by a `.divider`. */
export function IndicatorPills({
  active,
  onToggle,
  activePanes,
  onTogglePane,
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
      <span className={styles.divider} />
      {PANES.map((p) => {
        return (
          <button
            key={p.id}
            type="button"
            className={styles.pill}
            data-testid="chart-pane-pill"
            data-pane={p.id}
            data-active={String(activePanes.includes(p.id))}
            onClick={() => {
              onTogglePane(p.id);
            }}
          >
            {p.label}
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

interface PaneOption {
  id: EqPaneId;
  label: string;
}

const INDICATORS: readonly IndicatorOption[] = [
  { id: "sma20", label: "SMA 20" },
  { id: "ema50", label: "EMA 50" },
];

const PANES: readonly PaneOption[] = [
  { id: "rsi", label: "RSI" },
  { id: "macd", label: "MACD" },
];

export interface IndicatorPillsProps {
  active: readonly EqIndicatorId[];
  onToggle: (id: EqIndicatorId) => void;
  activePanes: readonly EqPaneId[];
  onTogglePane: (id: EqPaneId) => void;
}
