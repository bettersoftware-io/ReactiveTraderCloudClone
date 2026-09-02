import type { ReactElement } from "react";

import type { CandleTimeframe } from "@rtc/domain";

import styles from "./TimeframePills.module.css";

/** The 1D/1W/1M/3M timeframe selector. Pure props leaf: `tf` is the current
 * selection, `onSet` fires when a pill is clicked. */
export function TimeframePills({
  tf,
  onSet,
}: TimeframePillsProps): ReactElement {
  function selectTimeframe(id: CandleTimeframe) {
    return () => {
      onSet(id);
    };
  }

  return (
    <div className={styles.pills}>
      {TIMEFRAMES.map((id) => {
        return (
          <button
            key={id}
            type="button"
            className={styles.pill}
            data-tf={id}
            data-active={String(id === tf)}
            onClick={selectTimeframe(id)}
          >
            {id}
          </button>
        );
      })}
    </div>
  );
}

const TIMEFRAMES: readonly CandleTimeframe[] = ["1D", "1W", "1M", "3M"];

export interface TimeframePillsProps {
  tf: CandleTimeframe;
  onSet: (tf: CandleTimeframe) => void;
}
