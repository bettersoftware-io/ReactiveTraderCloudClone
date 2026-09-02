import { For, type JSX } from "solid-js";

import type { CandleTimeframe } from "@rtc/domain";

import styles from "./TimeframePills.module.css";

/** The 1D/1W/1M/3M timeframe selector. Pure props leaf: `tf` is the current
 * selection, `onSet` fires when a pill is clicked. */
export function TimeframePills(props: TimeframePillsProps): JSX.Element {
  function selectTimeframe(id: CandleTimeframe) {
    return () => {
      props.onSet(id);
    };
  }

  return (
    <div class={styles.pills}>
      <For each={TIMEFRAMES}>
        {(id: CandleTimeframe): JSX.Element => {
          return (
            <button
              type="button"
              class={styles.pill}
              data-tf={id}
              data-active={String(id === props.tf)}
              onClick={selectTimeframe(id)}
            >
              {id}
            </button>
          );
        }}
      </For>
    </div>
  );
}

const TIMEFRAMES: readonly CandleTimeframe[] = ["1D", "1W", "1M", "3M"];

export interface TimeframePillsProps {
  tf: CandleTimeframe;
  onSet: (tf: CandleTimeframe) => void;
}
