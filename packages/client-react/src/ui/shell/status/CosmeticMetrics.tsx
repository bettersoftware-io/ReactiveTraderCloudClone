// DECORATIVE — cosmetic HUD chrome, intentionally not wired to any port (spec: decorative-but-dead is allowed and explicit).
import type { ReactElement } from "react";

import styles from "./StatusBar.module.css";

export function CosmeticMetrics(): ReactElement {
  return (
    <div data-testid="cosmetic-metrics" className={styles.metrics}>
      {METRICS.map((m) => {
        return (
          <span key={m.label} className={styles.metric}>
            <span className={styles.metricSep}>│</span>
            <span className={styles.metricLabel}>{m.label}</span>
            <span className={styles.metricValue} data-tone={m.tone}>
              {m.value}
            </span>
          </span>
        );
      })}
      <span className={styles.spacer} />
      <span className={styles.build}>{BUILD}</span>
      <span className={styles.metricSep}>│</span>
      <span className={styles.clock}>{CLOCK} UTC</span>
    </div>
  );
}

/** Static status-bar readouts (prototype footer: static `GW eu-west-1` at
 *  Reactive Trader.dc.html:732 followed by the data-bound `statusItems` cells
 *  [LAT, TPUT, FPS, MEM, POS, P&L, SES] computed at ~L1391-1400). These are
 *  fixed, seeded values in PROTO's value shapes (TPUT `(tput/1000).toFixed(2)
 *  + 'k/s'` off a ~1200 msg/s seed; SES `Math.round(sess)` off a ~1280 seed)
 *  — there is no telemetry stream, and the clock is a STATIC seeded string
 *  (no ticking timer) so the view stays gate-clean and golden-stable. */
const METRICS = [
  { label: "GW", value: "eu-west-1", tone: "dim" as const },
  { label: "LAT", value: "12ms", tone: "positive" as const },
  { label: "TPUT", value: "1.24k/s", tone: "dim" as const },
  { label: "FPS", value: "60", tone: "dim" as const },
  { label: "MEM", value: "248MB", tone: "dim" as const },
  { label: "POS", value: "8", tone: "dim" as const },
  { label: "P&L", value: "+17,120", tone: "positive" as const },
  { label: "SES", value: "1284", tone: "dim" as const },
];

const CLOCK = "09:47:03";
const BUILD = "BUILD v4.0.1";
