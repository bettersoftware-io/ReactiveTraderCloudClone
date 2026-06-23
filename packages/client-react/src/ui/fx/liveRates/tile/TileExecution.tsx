import type { ReactElement } from "react";

import { Direction } from "@rtc/domain";

import styles from "./TileExecution.module.css";

interface TileExecutionProps {
  onExecute: (direction: Direction) => void;
  disabled: boolean;
}

export function TileExecution({
  onExecute,
  disabled,
}: TileExecutionProps): ReactElement {
  return (
    <div className={styles.row}>
      <button
        type="button"
        data-testid="sell-btn"
        data-side="sell"
        onClick={() => {
          return onExecute(Direction.Sell);
        }}
        disabled={disabled}
        className={styles.button}
      >
        Sell
      </button>
      <button
        type="button"
        data-testid="buy-btn"
        data-side="buy"
        onClick={() => {
          return onExecute(Direction.Buy);
        }}
        disabled={disabled}
        className={styles.button}
      >
        Buy
      </button>
    </div>
  );
}
