// FPS + MEM are LIVE (useLiveMetrics, react-scan-style rAF meter); the rest of
// the footer is decorative static chrome. A frozen provider under the harnesses
// keeps goldens byte-identical.
import type { JSX } from "solid-js";
import { For } from "solid-js";

import { useLiveMetrics } from "./useLiveMetrics";

import styles from "./StatusBar.module.css";

export function CosmeticMetrics(): JSX.Element {
  const metrics = useLiveMetrics();

  // Ordered exactly as the prototype footer (GW, LAT, TPUT, FPS, MEM, POS, P&L,
  // SES); the two live cells are substituted in place.
  function cells(): MetricCell[] {
    const m = metrics();
    return [
      { label: "GW", value: "eu-west-1", tone: "dim" },
      { label: "LAT", value: "12ms", tone: "positive" },
      { label: "TPUT", value: "1.24k/s", tone: "dim" },
      {
        label: "FPS",
        value: m.fps === null ? "—" : String(m.fps),
        tone: m.fpsTone,
      },
      { label: "MEM", value: m.mem ?? "—", tone: "dim" },
      { label: "POS", value: "8", tone: "dim" },
      { label: "P&L", value: "+$17.1k", tone: "positive" },
      { label: "SES", value: "1284", tone: "dim" },
    ];
  }

  return (
    <div data-testid="cosmetic-metrics" class={styles.metrics}>
      <For each={cells()}>
        {(m: MetricCell) => {
          return (
            <span class={styles.metric}>
              <span class={styles.metricSep}>│</span>
              <span class={styles.metricLabel}>{m.label}</span>
              <span class={styles.metricValue} data-tone={m.tone}>
                {m.value}
              </span>
            </span>
          );
        }}
      </For>
      <span class={styles.spacer} />
      <span class={styles.build}>{BUILD}</span>
      <span class={styles.metricSep}>│</span>
      <span class={styles.clock}>{CLOCK} UTC</span>
    </div>
  );
}

interface MetricCell {
  label: string;
  value: string;
  tone: string;
}

/** Static status-bar readouts (prototype footer, Reactive Trader.dc.html:732+):
 *  GW/LAT/TPUT/POS/P&L/SES are fixed seeded values, and the clock is a static
 *  seeded string (no ticking timer) so the view stays gate-clean and
 *  golden-stable. FPS + MEM are now live (see useLiveMetrics). */
const CLOCK = "09:47:03";
const BUILD = "BUILD v4.0.1";
