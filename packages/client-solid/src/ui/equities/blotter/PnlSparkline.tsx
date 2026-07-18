import { createMemo, type JSX } from "solid-js";

import styles from "./PnlSparkline.module.css";

export function PnlSparkline(props: PnlSparklineProps): JSX.Element {
  const safe = createMemo((): number => {
    return props.maxAbsPnl !== undefined
      ? props.maxAbsPnl
      : Math.abs(props.pnl);
  });

  const path = createMemo((): string => {
    return buildSparkPath(props.pnl, safe());
  });

  const isPositive = createMemo((): boolean => {
    return props.pnl >= 0;
  });

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      class={styles.sparkline}
      aria-hidden="true"
    >
      {/* Zero baseline */}
      <line
        x1={PAD + HALF_W}
        y1={PAD}
        x2={PAD + HALF_W}
        y2={HEIGHT - PAD}
        stroke="var(--border)"
        stroke-width={1}
      />
      {/* P&L bar */}
      <path
        d={path()}
        fill={
          isPositive() ? "var(--accent-positive)" : "var(--accent-negative)"
        }
        opacity={0.7}
      />
    </svg>
  );
}

interface PnlSparklineProps {
  /** Current unrealised P&L value (positive = profit, negative = loss). */
  pnl: number;
  /**
   * Maximum absolute P&L across all positions — used to scale the bar
   * so all sparklines share the same axis. Defaults to abs(pnl) when omitted.
   */
  maxAbsPnl?: number;
}

const WIDTH = 80;
const HEIGHT = 16;
const CENTER_Y: number = HEIGHT / 2;
const PAD = 2;
const HALF_W: number = (WIDTH - PAD * 2) / 2;

/**
 * Mini SVG bar sparkline showing a single P&L value centred on a zero line.
 * Positive bars extend right (accent-positive), negative bars extend left
 * (accent-negative). Mirrors the PnlChart SVG pattern: pure path, no inline
 * colour literals.
 */
function buildSparkPath(pnl: number, maxAbsPnl: number): string {
  const safe = maxAbsPnl > 0 ? maxAbsPnl : 1;
  const fraction = Math.min(1, Math.abs(pnl) / safe);
  const barLen = fraction * HALF_W;
  const cx = PAD + HALF_W;
  const barTop = CENTER_Y - 4;
  const barH = 8;

  if (pnl >= 0) {
    // bar extends rightward from centre
    return `M${cx},${barTop} h${barLen} v${barH} h-${barLen} Z`;
  }

  // bar extends leftward from centre
  return `M${cx},${barTop} h-${barLen} v${barH} h${barLen} Z`;
}
