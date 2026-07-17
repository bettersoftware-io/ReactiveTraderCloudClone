import type { JSX } from "solid-js";
import { createMemo } from "solid-js";

import styles from "./RfqCountdown.module.css";

export function RfqCountdown(props: RfqCountdownProps): JSX.Element {
  const fraction = createMemo((): number => {
    return props.totalMs > 0 ? props.remainingMs / props.totalMs : 0;
  });
  const seconds = createMemo((): number => {
    return Math.ceil(props.remainingMs / 1000);
  });
  // Captured ONCE at component setup (Solid components run their body once
  // per mount, the direct analogue of React's `useState(() => ...)`
  // initializer): the fill is a single mount-time CSS animation over the RFQ
  // window, fast-forwarded via a negative animation-delay — NOT re-driven
  // per tick (per-tick geometry writes kept a main-thread animation alive
  // every frame; see RfqCountdown.module.css .fill).
  const drainTiming: JSX.CSSProperties = {
    // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
    "--rfq-duration": `${props.totalMs}ms`,
    // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
    "--rfq-delay": `${Math.min(0, props.remainingMs - props.totalMs)}ms`,
  };

  return (
    <div class={styles.wrapper}>
      <div class={styles.track}>
        <div
          data-testid="rfq-countdown-fill"
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
