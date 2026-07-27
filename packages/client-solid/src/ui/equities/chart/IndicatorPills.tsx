import { For, type JSX } from "solid-js";

import type { EqIndicatorId } from "@rtc/client-core";

import styles from "./TimeframePills.module.css";

/** The SMA20/EMA50 indicator-overlay toggles — a `TimeframePills` clone
 * (reuses its module-css shape verbatim), but each pill's active state is
 * independent (a toggle, not a mutually-exclusive selection). */
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
