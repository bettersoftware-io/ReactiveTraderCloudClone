// The GW/LAT/TPUT/POS/P&L/SES cells, build tag, and clock are decorative static
// chrome (see the comment on the static rows below). FPS + MEM are LIVE — real
// measurements from useLiveMetrics (react-scan-style rAF meter). Under the
// visual/contract harnesses a frozen provider reproduces the pre-change footer
// so goldens stay byte-identical; production has no provider and runs live.
import type { ReactElement } from "react";

import { useLiveMetrics } from "./useLiveMetrics";

import styles from "./StatusBar.module.css";

export function CosmeticMetrics(): ReactElement {
  const { fps, fpsTone, mem } = useLiveMetrics();

  // Ordered exactly as the prototype footer (GW, LAT, TPUT, FPS, MEM, POS, P&L,
  // SES); the two live cells are substituted in place.
  const metrics = [
    { label: "GW", value: "eu-west-1", tone: "dim" },
    { label: "LAT", value: "12ms", tone: "positive" },
    { label: "TPUT", value: "1.24k/s", tone: "dim" },
    { label: "FPS", value: fps === null ? "—" : String(fps), tone: fpsTone },
    { label: "MEM", value: mem ?? "—", tone: "dim" },
    { label: "POS", value: "8", tone: "dim" },
    { label: "P&L", value: "+$17.1k", tone: "positive" },
    { label: "SES", value: "1284", tone: "dim" },
  ];

  return (
    <div data-testid="cosmetic-metrics" className={styles.metrics}>
      {metrics.map((m) => {
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

/** Static status-bar readouts (prototype footer, Reactive Trader.dc.html:732+):
 *  GW/LAT/TPUT/POS/P&L/SES are fixed seeded values, and the clock is a static
 *  seeded string (no ticking timer) so the view stays gate-clean and
 *  golden-stable. FPS + MEM are now live (see useLiveMetrics). */
const CLOCK = "09:47:03";
const BUILD = "BUILD v4.0.1";
