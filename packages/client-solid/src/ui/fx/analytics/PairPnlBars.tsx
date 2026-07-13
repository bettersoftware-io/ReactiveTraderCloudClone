import type { JSX } from "solid-js";
import { createMemo, createSignal, For } from "solid-js";

import {
  type CurrencyPairPosition,
  formatPnlK,
  formatPrecise2,
} from "@rtc/domain";

import styles from "./PairPnlBars.module.css";

export function PairPnlBars(props: PairPnlBarsProps): JSX.Element {
  const [hoveredSymbol, setHoveredSymbol] = createSignal<string | null>(null);

  const maxAbsPnl = createMemo((): number => {
    return Math.max(
      ...props.positions.map((p) => {
        return Math.abs(p.basePnl);
      }),
      1,
    );
  });

  return (
    <div class={styles.container}>
      <For each={props.positions}>
        {(pos: CurrencyPairPosition) => {
          const fraction = createMemo((): number => {
            return pos.basePnl / maxAbsPnl();
          });
          const sign = createMemo((): "pos" | "neg" => {
            return pos.basePnl >= 0 ? "pos" : "neg";
          });
          const barWidth = createMemo((): string => {
            return `${Math.abs(fraction()) * 50}%`;
          });
          const hovering = createMemo((): boolean => {
            return hoveredSymbol() === pos.symbol;
          });
          const label = createMemo((): string => {
            return hovering()
              ? formatPrecise2(pos.basePnl)
              : formatPnlK(pos.basePnl);
          });

          return (
            <div class={styles.row}>
              <span class={styles.symbol}>{pos.symbol}</span>
              <div class={styles.barContainer}>
                {/* Center line */}
                <div class={styles.centerLine} />
                {/* Bar: continuous width via custom property; side via data-sign */}
                <div
                  data-sign={sign()}
                  class={styles.bar}
                  // eslint-disable-next-line no-restricted-syntax -- runtime geometry via CSS custom property; static CSS can't express it
                  style={{ "--bar-width": barWidth() }}
                />
              </div>
              <button
                type="button"
                data-sign={sign()}
                data-testid={`priceLabel-${pos.symbol}`}
                class={styles.pnlLabel}
                onMouseEnter={() => {
                  setHoveredSymbol(pos.symbol);
                }}
                onMouseLeave={() => {
                  setHoveredSymbol(null);
                }}
              >
                {label()}
              </button>
            </div>
          );
        }}
      </For>
    </div>
  );
}

interface PairPnlBarsProps {
  positions: readonly CurrencyPairPosition[];
}
