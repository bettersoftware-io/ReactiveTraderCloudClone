import { For, type JSX } from "solid-js";

import type { EqIndicatorId, EqPaneId, EqYScale } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The SMA20/EMA50 overlay toggles, the RSI/MACD indicator-pane toggles,
 * and the LOG axis-scale toggle — a `TimeframePills` clone (reuses its
 * module-css shape verbatim), but every pill's active state is independent
 * (a toggle, not a mutually-exclusive selection). Three toggle groups
 * (overlays / panes / axis scale) share one pill row, each split from the
 * next by a `.divider`. */
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
      <span class={styles.divider} />
      <button
        type="button"
        class={styles.pill}
        data-testid="chart-yscale-pill"
        data-active={String(!props.comparing && props.yScale === "log")}
        disabled={props.comparing ?? false}
        title={props.comparing ? "comparison uses percent scale" : undefined}
        onClick={() => {
          props.onToggleYScale();
        }}
      >
        {props.comparing ? "PCT" : "LOG"}
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
  /** Whether a comparison symbol is active — forces the axis to percent
   * scale, so the LOG toggle becomes a disabled "PCT" readout. Optional so
   * existing spec/visual mounts keep compiling. */
  comparing?: boolean;
}
