import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";

import styles from "./RfqCountdown.module.css";

export function RfqCountdown({
  remainingMs,
  totalMs,
}: RfqCountdownProps): ReactElement {
  const fraction = totalMs > 0 ? remainingMs / totalMs : 0;
  const seconds = Math.ceil(remainingMs / 1000);
  // Captured ONCE at mount (useState initializer): the fill is a single
  // mount-time CSS animation over the RFQ window, fast-forwarded via a
  // negative animation-delay — NOT re-driven per tick (per-tick geometry
  // writes kept a main-thread animation alive every frame; see
  // RfqCountdown.module.css .fill).
  //
  // `data-motion="fast-forwarded"` below states the consequence of that
  // negative delay: the delay IS elapsed time, so the animation's time 0 is
  // the state this component was mounted in, and its END is an empty bar.
  // Anything settling page motion by jumping animations to their end (a
  // screenshot tool, say) would photograph a drained bar for a live RFQ, so
  // the attribute marks the element where "hold at time 0" is the honest
  // freeze. Same treatment on the credit RfqCard drain bar.
  const [drainTiming] = useState<CSSProperties>(() => {
    return {
      "--rfq-duration": `${totalMs}ms`,
      "--rfq-delay": `${Math.min(0, remainingMs - totalMs)}ms`,
    } as CSSProperties;
  });

  return (
    <div className={styles.wrapper}>
      <div className={styles.track}>
        <div
          data-testid="rfq-countdown-fill"
          data-motion="fast-forwarded"
          data-warn={fraction <= 0.3 ? "true" : "false"}
          className={styles.fill}
          style={drainTiming}
        />
      </div>
      <span className={styles.caption}>{seconds}s remaining</span>
    </div>
  );
}

interface RfqCountdownProps {
  remainingMs: number;
  totalMs: number;
}
