import type { CSSProperties, ReactElement } from "react";

import styles from "./RfqCountdown.module.css";

interface RfqCountdownProps {
  remainingMs: number;
  totalMs: number;
}

export function RfqCountdown({
  remainingMs,
  totalMs,
}: RfqCountdownProps): ReactElement {
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0;
  const seconds = Math.ceil(remainingMs / 1000);

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        <div
          data-testid="rfq-countdown-fill"
          data-warn={fraction <= 0.3 ? "true" : "false"}
          className={styles.fill}
          style={{ "--rfq-fill": `${fraction * 100}%` } as CSSProperties}
        />
      </div>
      <span className={styles.caption}>{seconds}s remaining</span>
    </div>
  );
}
