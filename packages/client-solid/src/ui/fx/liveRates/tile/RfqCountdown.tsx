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
    // Not a remount-guarded read (TileRfq's <Match when={status ===
    // "received" && quote}> mounts this component once when the RFQ enters
    // "received" and keeps it mounted for the rest of the countdown, ticking
    // remainingMs down without remounting): captured once on purpose, per
    // the doc comment above — a live read here would re-trigger the CSS
    // keyframe every tick, which is exactly what this shape avoids.
    // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
    "--rfq-duration": `${props.totalMs}ms`,
    // eslint-disable-next-line solid/reactivity -- setup-scope read is correct (see doc comment above)
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
