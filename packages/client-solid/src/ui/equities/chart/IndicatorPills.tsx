import { For, type JSX } from "solid-js";

import type { EqIndicatorId, EqPaneId } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The SMA20/EMA50 overlay toggles, plus the RSI/MACD indicator-pane
 * toggles — a `TimeframePills` clone (reuses its module-css shape
 * verbatim), but every pill's active state is independent (a toggle, not a
 * mutually-exclusive selection). The two groups are separate toggle sets
 * (an overlay and a pane can both be active for the same indicator name)
 * sharing one pill row, split by a `.divider`. */
export function IndicatorPills(props: IndicatorPillsProps): JSX.Element {
  return (
    <div class={styles.pills}>
      <For each={INDICATORS}>
        {(opt: IndicatorOption): JSX.Element => {
          return (
            <button
              type="button"
              class={styles.pill}
              data-testid="chart-indicator-pill"
              data-ind={opt.id}
              data-active={String(props.active.includes(opt.id))}
              onClick={() => {
                props.onToggle(opt.id);
              }}
            >
              {opt.label}
            </button>
          );
        }}
      </For>
      <span class={styles.divider} />
      <For each={PANES}>
        {(p: PaneOption): JSX.Element => {
          return (
            <button
              type="button"
              class={styles.pill}
              data-testid="chart-pane-pill"
              data-pane={p.id}
              data-active={String(props.activePanes.includes(p.id))}
              onClick={() => {
                props.onTogglePane(p.id);
              }}
            >
              {p.label}
            </button>
          );
        }}
      </For>
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
