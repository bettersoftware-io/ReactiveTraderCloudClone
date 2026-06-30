import type { ReactElement } from "react";

import { formatPnlValue } from "@rtc/domain";

import styles from "./PnlValue.module.css";

export function PnlValue({ value }: PnlValueProps): ReactElement {
  const sign = value >= 0 ? "pos" : "neg";

  return (
    <div data-sign={sign} className={styles.value}>
      <span className={styles.currency}>USD</span>{" "}
      <span className={styles.amount} data-testid="lastPosition">
        {formatPnlValue(value)}
      </span>
    </div>
  );
}

interface PnlValueProps {
  value: number;
}
