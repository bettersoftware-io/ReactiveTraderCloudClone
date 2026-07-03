import type { ReactElement } from "react";

import { formatPnlHeadline } from "@rtc/domain";

import styles from "./PnlValue.module.css";

export function PnlValue({ value }: PnlValueProps): ReactElement {
  const sign = value >= 0 ? "pos" : "neg";

  return (
    <div data-sign={sign} className={styles.value}>
      <span className={styles.amount} data-testid="lastPosition">
        {formatPnlHeadline(value)}
      </span>
    </div>
  );
}

interface PnlValueProps {
  value: number;
}
