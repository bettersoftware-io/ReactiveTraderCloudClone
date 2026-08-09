import type { ReactElement } from "react";

import type { EqIndicatorId, EqPaneId, EqYScale } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The SMA20/EMA50 overlay toggles, the RSI/MACD indicator-pane toggles,
 * and the LOG axis-scale toggle — a `TimeframePills` clone (reuses its
 * module-css shape verbatim), but every pill's active state is independent
 * (a toggle, not a mutually-exclusive selection). Three toggle groups
 * (overlays / panes / axis scale) share one pill row, each split from the
 * next by a `.divider`. */
export function IndicatorPills({
  active,
  onToggle,
  activePanes,
  onTogglePane,
  yScale,
  onToggleYScale,
  comparing = false,
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
      <span className={styles.divider} />
      <button
        type="button"
        className={styles.pill}
        data-testid="chart-yscale-pill"
        data-active={String(!comparing && yScale === "log")}
        disabled={comparing}
        title={comparing ? "comparison uses percent scale" : undefined}
        onClick={() => {
          onToggleYScale();
        }}
      >
        {comparing ? "PCT" : "LOG"}
      </button>
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
  yScale: EqYScale;
  onToggleYScale: () => void;
  /** Whether a comparison symbol is active — renders the axis-scale pill as
   * a disabled "PCT" marker (comparison forces the percent axis; the stored
   * linear/log preference underneath is untouched). Default false. */
  comparing?: boolean;
}
