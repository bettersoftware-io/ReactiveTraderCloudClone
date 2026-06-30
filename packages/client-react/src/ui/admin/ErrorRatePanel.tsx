import type { ReactElement } from "react";

import type { MetricSample } from "@rtc/domain";

import { useViewModel } from "#/ui/hooks/useViewModel";

import styles from "./ErrorRatePanel.module.css";

type Level = "ok" | "warn" | "error";

const VIEW_W = 200;
const VIEW_H = 48;
const PAD = 4;

// Sparkline path over the error-rate window. "" when fewer than two points.
function buildSparkline(samples: readonly MetricSample[]): string {
  if (samples.length < 2) return "";

  const values = samples.map((s) => {
    return s.value;
  });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const plotW = VIEW_W - PAD * 2;
  const plotH = VIEW_H - PAD * 2;
  const step = plotW / (values.length - 1);

  return values
    .map((v, i) => {
      const x = PAD + i * step;
      const y = PAD + plotH - ((v - min) / range) * plotH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

// Severity bucket as a pure function of the latest value against the peak.
function levelFor(latest: number, peak: number): Level {
  const fraction = peak > 0 ? latest / peak : 0;
  if (fraction > 0.66) return "error";
  if (fraction > 0.33) return "warn";
  return "ok";
}

/**
 * Current error-rate readout plus a sparkline of the window. The severity badge
 * is a pure bucket of the latest value relative to the window peak.
 */
export function ErrorRatePanel(): ReactElement {
  const { useMetrics } = useViewModel();
  const { errorRate } = useMetrics();

  const latest =
    errorRate.length > 0 ? errorRate[errorRate.length - 1].value : 0;
  const peak = Math.max(
    0,
    ...errorRate.map((s) => {
      return s.value;
    }),
  );
  const level = levelFor(latest, peak);
  const path = buildSparkline(errorRate);

  return (
    <div
      data-testid="admin-error-rate"
      data-level={level}
      className={styles.panel}
    >
      <div className={styles.head}>
        <span className={styles.label}>ERROR RATE</span>
        <span data-level={level} className={styles.badge}>
          {level.toUpperCase()}
        </span>
      </div>
      <div className={styles.value}>{latest.toFixed(2)}</div>
      {path === "" ? (
        <div className={styles.empty}>NO DATA</div>
      ) : (
        <svg
          width="100%"
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          preserveAspectRatio="none"
          className={styles.spark}
          aria-label="Error-rate sparkline"
        >
          <title>Error-rate sparkline</title>
          <path d={path} fill="none" className={styles.line} />
        </svg>
      )}
    </div>
  );
}
