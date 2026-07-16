import { createMemo, type JSX, Show } from "solid-js";

import type { EquityPosition } from "@rtc/domain";

import styles from "./DeskPnlGauge.module.css";

export function DeskPnlGauge(props: DeskPnlGaugeProps): JSX.Element {
  const totalPnl = createMemo((): number => {
    return props.positions.reduce((acc, p) => {
      return acc + p.unrealisedPnl;
    }, 0);
  });
  const maxAbsPnl = createMemo((): number => {
    return Math.max(
      ...props.positions.map((p) => {
        return Math.abs(p.unrealisedPnl);
      }),
      1,
    );
  });

  const isPositive = createMemo((): boolean => totalPnl() >= 0);
  const sign = createMemo((): "pos" | "neg" => (isPositive() ? "pos" : "neg"));
  const paths = createMemo((): GaugePaths => {
    return buildGaugePaths(totalPnl(), maxAbsPnl());
  });

  const displayPnl = createMemo((): string => {
    const pnl = totalPnl();
    return Math.abs(pnl) >= 1000
      ? `${(pnl / 1000).toFixed(1)}k`
      : pnl.toFixed(0);
  });

  // viewBox trims to the lower semicircle only: y ∈ [CY−PAD, CY+R+PAD].
  // Old box was "0 0 108 100" (upper arc, lower half entirely empty).
  // New box shows only the bottom-arc region.
  const viewBoxY = CY - PAD; // 42
  const viewBoxH = R + PAD * 2; // 56
  const viewBoxW = CX * 2 + 4; // 108

  return (
    <div class={styles.gauge}>
      <svg
        width={viewBoxW}
        height={viewBoxH}
        viewBox={`0 ${viewBoxY} ${viewBoxW} ${viewBoxH}`}
        class={styles.svg}
        aria-label="Desk P&L gauge"
      >
        <title>Desk P&amp;L</title>
        {/* Track: lower semicircle from left to right, dipping through bottom-center */}
        <path
          d={paths().track}
          fill="none"
          stroke="var(--border)"
          stroke-width={6}
          stroke-linecap="round"
        />
        {/* Fill arc: zero at bottom-center; positive sweeps right, negative sweeps left */}
        <Show when={paths().fill !== null}>
          <path
            d={paths().fill ?? ""}
            fill="none"
            stroke={
              isPositive() ? "var(--accent-positive)" : "var(--accent-negative)"
            }
            stroke-width={6}
            stroke-linecap="round"
          />
        </Show>
        {/* Needle tip at current P&L position on the arc */}
        <circle
          cx={paths().needleX}
          cy={paths().needleY}
          r={4}
          fill={
            isPositive() ? "var(--accent-positive)" : "var(--accent-negative)"
          }
        />
        {/* Centre dot at the arc origin */}
        <circle cx={CX} cy={CY} r={3} fill="var(--border)" />
      </svg>
      <span class={styles.label}>DESK P&amp;L</span>
      <span data-sign={sign()} class={styles.value}>
        {isPositive() ? "+" : ""}
        {displayPnl()}
      </span>
    </div>
  );
}

interface DeskPnlGaugeProps {
  positions: readonly EquityPosition[];
}

const R = 40; // arc radius
const CX = 52; // horizontal centre of the gauge circle
const CY = 50; // vertical centre; arc endpoints sit at y=CY (left and right)
const PAD = 8; // padding above and below the arc in the viewBox

/**
 * Point on the gauge circle at angle θ.
 * SVG Y-down convention: θ=0→right (CX+R, CY), θ=π/2→bottom (CX, CY+R), θ=π→left (CX−R, CY).
 */
function arcPt(a: number): [number, number] {
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)];
}

interface GaugePaths {
  track: string;
  fill: string | null; // null when |fraction| < 0.001 (degenerate zero arc)
  needleX: number;
  needleY: number;
}

/**
 * Build SVG paths for a bottom-arc speedometer gauge.
 *
 * Layout (SVG Y-down):
 *   θ = π   (left)          → max negative P&L   x=CX−R, y=CY
 *   θ = π/2 (bottom-center) → zero P&L           x=CX,   y=CY+R
 *   θ = 0   (right)         → max positive P&L   x=CX+R, y=CY
 *
 * Angle mapping: angle(fraction) = (π/2) × (1 − fraction)
 *   fraction=−1 → π   (left)          ✓
 *   fraction= 0 → π/2 (bottom-center) ✓
 *   fraction=+1 → 0   (right)         ✓
 *
 * Track: lower semicircle from left (π) to right (0), swept counter-clockwise
 *   (sweep=0, decreasing θ), which dips DOWN through bottom-center at y=CY+R.
 * Fill:  arc from bottom-center (zero point) to needle position;
 *   sweep=0 (decreasing θ) for positive P&L (toward right),
 *   sweep=1 (increasing θ) for negative P&L (toward left).
 */
function buildGaugePaths(totalPnl: number, maxAbsPnl: number): GaugePaths {
  // Normalise to [−1, 1]
  const safe = maxAbsPnl > 0 ? maxAbsPnl : 1;
  const fraction = Math.max(-1, Math.min(1, totalPnl / safe));

  // Map fraction to angle in the bottom-arc convention
  const angle = (Math.PI / 2) * (1 - fraction);

  // Track: lower semicircle from left (π) to right (0).
  // sweep=0 (counter-clockwise / decreasing θ) passes through bottom (π/2) ✓
  const [x0, y0] = arcPt(Math.PI); // (CX−R, CY) = left endpoint
  const [x1, y1] = arcPt(0); // (CX+R, CY) = right endpoint
  const track = `M${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 0 0 ${x1.toFixed(1)},${y1.toFixed(1)}`;

  const [nx, ny] = arcPt(angle); // needle tip position

  // Guard: skip the fill arc when P&L ≈ 0 (degenerate start==end arc)
  if (Math.abs(fraction) < 0.001) {
    return { track, fill: null, needleX: nx, needleY: ny };
  }

  // Fill arc from bottom-center (zero point) to needle position
  const [xFs, yFs] = arcPt(Math.PI / 2); // bottom-center (CX, CY+R)
  const [xFe, yFe] = arcPt(angle);
  // Positive: angle < π/2 → sweep=0 (decreasing θ, sweeps toward right endpoint)
  // Negative: angle > π/2 → sweep=1 (increasing θ, sweeps toward left endpoint)
  const fillSweep = fraction >= 0 ? 0 : 1;
  const fill = `M${xFs.toFixed(1)},${yFs.toFixed(1)} A${R},${R} 0 0 ${fillSweep} ${xFe.toFixed(1)},${yFe.toFixed(1)}`;

  return { track, fill, needleX: nx, needleY: ny };
}
