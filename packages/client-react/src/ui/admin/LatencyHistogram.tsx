import type { ReactElement } from "react";

import type { MetricSample } from "@rtc/domain";

import { useViewModel } from "#/ui/viewModel/useViewModel";

import styles from "./LatencyHistogram.module.css";

const VIEW_W = 240;
const VIEW_H = 96;
const PAD = 4;
const MAX_BARS = 32;

interface Bar {
  x: number;
  y: number;
  w: number;
  h: number;
  key: number;
}

interface Histogram {
  bars: readonly Bar[];
  peakMs: number;
}

// Pure geometry: the most-recent MAX_BARS latency samples become vertical bars,
// each height a fraction of the window peak. Mirrors PnlChart.buildChart.
function buildHistogram(samples: readonly MetricSample[]): Histogram {
  if (samples.length === 0) return { bars: [], peakMs: 0 };

  const recent = samples.slice(-MAX_BARS);
  const values = recent.map((s) => {
    return s.value;
  });
  const peakMs = Math.max(1, ...values);

  const plotW = VIEW_W - PAD * 2;
  const plotH = VIEW_H - PAD * 2;
  const slotW = plotW / recent.length;
  const barW = Math.max(1, slotW * 0.7);

  const bars = recent.map((s, i): Bar => {
    const h = (s.value / peakMs) * plotH;
    return {
      x: PAD + i * slotW + (slotW - barW) / 2,
      y: PAD + (plotH - h),
      w: barW,
      h: Math.max(1, h),
      key: s.t,
    };
  });

  return { bars, peakMs };
}

/**
 * Latency distribution as SVG bars — height per bar is a pure function of the
 * sample value against the window peak. No timers; re-derives on each render.
 */
export function LatencyHistogram(): ReactElement {
  const { useMetrics } = useViewModel();
  const { latency } = useMetrics();
  const { bars, peakMs } = buildHistogram(latency);

  return (
    <div data-testid="admin-latency-histogram" className={styles.wrapper}>
      <div className={styles.head}>
        <span className={styles.label}>LATENCY</span>
        <span className={styles.peak}>peak {peakMs.toFixed(0)}ms</span>
      </div>
      {bars.length === 0 ? (
        <div className={styles.empty}>NO DATA</div>
      ) : (
        <svg
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className={styles.chart}
          aria-label="Latency histogram"
        >
          <title>Latency histogram</title>
          {bars.map((b) => {
            return (
              <rect
                key={b.key}
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                className={styles.bar}
              />
            );
          })}
        </svg>
      )}
    </div>
  );
}
