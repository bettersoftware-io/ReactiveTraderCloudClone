import type { ReactElement } from "react";

import type { MetricSample } from "@rtc/domain";

import { useViewModel } from "#/ui/viewModel/useViewModel";

import styles from "./MetricGauges.module.css";

type GaugeMetric = "throughput" | "latency" | "errorRate";

interface RadialGaugeProps {
  metric: GaugeMetric;
  label: string;
  display: string;
  /** Sweep fraction in [0, 1] — drives the filled arc length. */
  fraction: number;
}

const CX = 42;
const CY = 42;
const R = 34;
const START_DEG = 135; // bottom-left
const SWEEP_DEG = 270; // 270° open-bottom arc

// SVG arc helper — angle measured clockwise from 12 o'clock.
function polarToCartesian(angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
}

function arcPath(startDeg: number, endDeg: number): string {
  const [sx, sy] = polarToCartesian(startDeg);
  const [ex, ey] = polarToCartesian(endDeg);
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1;
  return `M${sx.toFixed(1)},${sy.toFixed(1)} A${R},${R} 0 ${largeArc} 1 ${ex.toFixed(1)},${ey.toFixed(1)}`;
}

// Latest sample value, or 0 when the series has not emitted yet.
function latest(samples: readonly MetricSample[]): number {
  return samples.length > 0 ? samples[samples.length - 1].value : 0;
}

// Peak of the series (>= 1) so the gauge sweeps relative to the live range.
function peak(samples: readonly MetricSample[]): number {
  return Math.max(
    1,
    ...samples.map((s) => {
      return s.value;
    }),
  );
}

function RadialGauge({
  metric,
  label,
  display,
  fraction,
}: RadialGaugeProps): ReactElement {
  const clamped = Math.max(0, Math.min(1, fraction));
  const track = arcPath(START_DEG, START_DEG + SWEEP_DEG);
  const fill = arcPath(START_DEG, START_DEG + SWEEP_DEG * clamped);

  return (
    <div data-metric={metric} className={styles.gauge}>
      <svg
        width={CX * 2}
        height={CY * 2}
        viewBox={`0 0 ${CX * 2} ${CY * 2}`}
        className={styles.svg}
        aria-label={`${label} gauge`}
      >
        <title>{label}</title>
        <path d={track} fill="none" className={styles.track} />
        {clamped > 0.001 && (
          <path d={fill} fill="none" className={styles.fill} />
        )}
      </svg>
      <span className={styles.value}>{display}</span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}

/**
 * Three radial gauges driven by the latest sample of each metric window. Each
 * gauge sweeps relative to its own series peak — a pure function of the data,
 * no thresholds baked in. Decorative-but-real: the arc moves with live metrics.
 */
export function MetricGauges(): ReactElement {
  const { useMetrics } = useViewModel();
  const { throughput, latency, errorRate } = useMetrics();

  const tpVal = latest(throughput);
  const latVal = latest(latency);
  const errVal = latest(errorRate);

  return (
    <div className={styles.row}>
      <RadialGauge
        metric="throughput"
        label="THROUGHPUT"
        display={`${tpVal.toFixed(0)}/s`}
        fraction={tpVal / peak(throughput)}
      />
      <RadialGauge
        metric="latency"
        label="LATENCY"
        display={`${latVal.toFixed(0)}ms`}
        fraction={latVal / peak(latency)}
      />
      <RadialGauge
        metric="errorRate"
        label="ERROR RATE"
        display={errVal.toFixed(2)}
        fraction={errVal / peak(errorRate)}
      />
    </div>
  );
}
