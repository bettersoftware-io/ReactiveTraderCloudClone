import type { ReactElement } from "react";

import styles from "#/equities/Chart/TimeframePills.module.css";
import type { Timeframe } from "#/equities/types";

export interface TimeframePillsProps {
  tf: Timeframe;
  onSet(tf: Timeframe): void;
}

const TIMEFRAMES: Timeframe[] = ["1D", "1W", "1M", "3M"];

// PROTO L603: the 1D/1W/1M/3M timeframe selector.
export function TimeframePills(props: TimeframePillsProps): ReactElement {
  const { tf, onSet } = props;

  return (
    <div className={styles.pills}>
      {TIMEFRAMES.map((id) => {
        return (
          <TimeframePill key={id} id={id} active={id === tf} onSet={onSet} />
        );
      })}
    </div>
  );
}

interface TimeframePillProps {
  id: Timeframe;
  active: boolean;
  onSet(tf: Timeframe): void;
}

function TimeframePill(props: TimeframePillProps): ReactElement {
  const { id, active, onSet } = props;

  function handleClick(): void {
    onSet(id);
  }

  return (
    <button
      type="button"
      className={styles.pill}
      data-tf={id}
      data-active={String(active)}
      onClick={handleClick}
    >
      {id}
    </button>
  );
}
