import type { JSX } from "solid-js";
import { createMemo, untrack } from "solid-js";

import styles from "./RfqCountdown.module.css";

export function RfqCountdown(props: RfqCountdownProps): JSX.Element {
  const fraction = createMemo((): number => {
    return props.totalMs > 0 ? props.remainingMs / props.totalMs : 0;
  });

  const seconds = createMemo((): number => {
    return Math.ceil(props.remainingMs / 1000);
  });

  // A snapshot ON PURPOSE, which is why it is spelt `untrack` rather than
  // read live: the fill is ONE mount-time CSS animation over the whole RFQ
  // window, fast-forwarded with a negative animation-delay. Re-reading
  // remainingMs/totalMs here would rewrite these custom properties every
  // tick and re-trigger the keyframe every tick — the per-frame main-thread
  // animation this shape exists to avoid (see RfqCountdown.module.css .fill).
  //
  // `data-motion="fast-forwarded"` below states the consequence of that
  // negative delay: the delay IS elapsed time, so the animation's time 0 is
  // the state this component was mounted in, and its END is an empty bar.
  // Anything settling page motion by jumping animations to their end (a
  // screenshot tool, say) would photograph a drained bar for a live RFQ, so
  // the attribute marks the element where "hold at time 0" is the honest
  // freeze. Same treatment on the credit RfqCard drain bar.
  const drainTiming = untrack((): JSX.CSSProperties => {
    return {
      "--rfq-duration": `${props.totalMs}ms`,
      "--rfq-delay": `${Math.min(0, props.remainingMs - props.totalMs)}ms`,
    };
  });

  return (
    <div class={styles.wrapper}>
      <div class={styles.track}>
        <div
          data-testid="rfq-countdown-fill"
          data-motion="fast-forwarded"
          data-warn={fraction() <= 0.3 ? "true" : "false"}
          class={styles.fill}
          style={drainTiming}
        />
      </div>
      <span class={styles.caption}>{seconds()}s remaining</span>
    </div>
  );
}

interface RfqCountdownProps {
  remainingMs: number;
  totalMs: number;
}
