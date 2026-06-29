import type { ReactElement } from "react";

import type { EquityPosition } from "@rtc/domain";

import styles from "./DeskPnlGauge.module.css";

interface DeskPnlGaugeProps {
  positions: readonly EquityPosition[];
}

const R = 40; // arc radius
const CX = 52;
const CY = 50;
const START_ANGLE: number = Math.PI; // 180° — leftmost (most negative)
const END_ANGLE: number = 0; // 0° — rightmost (most positive)
const ARC_RANGE: number = Math.PI; // half circle

interface GaugePaths {
  track: string;
  fill: string;
  needleX: number;
  needleY: number;
}

/**
 * Build the SVG path for the gauge arc background and the needle arc fill.
 */
function buildGaugePaths(totalPnl: number, maxAbsPnl: number): GaugePaths {
  // Normalise to [-1, 1]
  const safe = maxAbsPnl > 0 ? maxAbsPnl : 1;
  const fraction = Math.max(-1, Math.min(1, totalPnl / safe));
  // Map fraction to angle: -1 → 180°, 0 → 270°, 1 → 360° (i.e. 0°)
  // The gauge sweeps from left (π) through bottom (3π/2) to right (0/2π)
  // fraction=0 → angle = 3π/2 (bottom)
  const midAngle = (3 * Math.PI) / 2;
  const sweepRange = ARC_RANGE / 2; // π/2 each side
  const angle = midAngle + fraction * sweepRange;

  // Track: full arc from START_ANGLE (π = left) to end (0 = right) going clockwise
  // i.e. π → 3π/2 → 2π (0)
  function arcPt(a: number): [number, number] {
    return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
  }

  const [x0, y0] = arcPt(START_ANGLE); // left tip
  const [x1, y1] = arcPt(END_ANGLE); // right tip (0°)
  const track = `M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;

  // Fill arc from midAngle to the needle angle
  const [xFillStart, yFillStart] = arcPt(midAngle);
  const [xFillEnd, yFillEnd] = arcPt(angle);
  // Large arc flag: 0 (always < 180° sweep for the fill half)
  const fillSweep = fraction >= 0 ? 1 : 0; // clockwise or counter
  const fillLarge = 0;
  const fill = `M${xFillStart.toFixed(1)},${yFillStart.toFixed(1)} A${R},${R} 0 ${fillLarge} ${fillSweep} ${xFillEnd.toFixed(1)},${yFillEnd.toFixed(1)}`;

  const [nx, ny] = arcPt(angle);
  return { track, fill: fill, needleX: nx, needleY: ny };
}

export function DeskPnlGauge({ positions }: DeskPnlGaugeProps): ReactElement {
  const totalPnl = positions.reduce((acc, p) => {
    return acc + p.unrealisedPnl;
  }, 0);
  const maxAbsPnl = Math.max(
    ...positions.map((p) => {
      return Math.abs(p.unrealisedPnl);
    }),
    1,
  );

  const isPositive = totalPnl >= 0;
  const sign = isPositive ? "pos" : "neg";
  const { track, fill, needleX, needleY } = buildGaugePaths(
    totalPnl,
    maxAbsPnl,
  );

  const displayPnl =
    Math.abs(totalPnl) >= 1000
      ? `${(totalPnl / 1000).toFixed(1)}k`
      : totalPnl.toFixed(0);

  return (
    <div className={styles.gauge}>
      <svg
        width={CX * 2 + 4}
        height={CY + R + 10}
        viewBox={`0 0 ${CX * 2 + 4} ${CY + R + 10}`}
        className={styles.svg}
        aria-label="Desk P&L gauge"
      >
        <title>Desk P&amp;L</title>
        {/* Track (full arc) */}
        <path
          d={track}
          fill="none"
          stroke="var(--border)"
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* Fill arc */}
        <path
          d={fill}
          fill="none"
          stroke={
            isPositive ? "var(--accent-positive)" : "var(--accent-negative)"
          }
          strokeWidth={6}
          strokeLinecap="round"
        />
        {/* Needle tip */}
        <circle
          cx={needleX}
          cy={needleY}
          r={4}
          fill={
            isPositive ? "var(--accent-positive)" : "var(--accent-negative)"
          }
        />
        {/* Centre dot */}
        <circle cx={CX} cy={CY} r={3} fill="var(--border)" />
      </svg>
      <span className={styles.label}>DESK P&amp;L</span>
      <span data-sign={sign} className={styles.value}>
        {isPositive ? "+" : ""}
        {displayPnl}
      </span>
    </div>
  );
}
