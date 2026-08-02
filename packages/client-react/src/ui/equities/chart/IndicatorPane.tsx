import type { ReactElement } from "react";

import {
  type ChartPoint,
  type ChartVarStyle,
  type EqPaneKind,
  MACD_FAST,
  MACD_SIGNAL,
  MACD_SLOW,
  type PaneBar,
  type PaneReadoutRow,
  type PaneScene,
  RSI_WINDOW,
} from "@rtc/motion-core";

import type { PaneHoverProps } from "./useChartGestures";

import styles from "./IndicatorPane.module.css";

/**
 * One RSI or MACD indicator pane below the price/volume plot: a corner
 * label, the pane's own SVG (reference guides, plotted line(s), and — MACD
 * only — the histogram), the crosshair's vertical-line echo, and the live
 * readout row. Pure props leaf, same "vm owns numbers, shell owns markup
 * strings" split as `SvgPathLayer`/`CandleBars` — `scene` arrives fully
 * projected into the 0-100 viewBox by `@rtc/motion-core`'s `paneScene`, so
 * this file does no math beyond joining points into an SVG attribute string
 * and batching the histogram's rects into one `d` path. Only the pane root
 * (carrying `hoverProps`, ChartPlot's forwarded `paneHoverProps`) accepts
 * pointer events — the crosshair echo and readout are `pointer-events: none`
 * (module css) so they never shadow it.
 */
export function IndicatorPane({
  kind,
  scene,
  readout,
  crosshairStyle,
  hoverProps,
}: IndicatorPaneProps): ReactElement {
  const zeroGuideY = scene.guides[0]?.y ?? 50;

  return (
    <div
      className={styles.pane}
      data-testid={`chart-pane-${kind}`}
      onPointerMove={hoverProps.onPointerMove}
      onPointerLeave={hoverProps.onPointerLeave}
    >
      <span className={styles.label}>{paneLabel(kind)}</span>
      <svg
        className={styles.svg}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {scene.guides.map((g) => {
          return (
            <line
              key={g.key}
              className={styles.guide}
              x1="0"
              y1={g.y}
              x2="100"
              y2={g.y}
            />
          );
        })}
        {scene.histogram.length > 0 && (
          <path
            className={styles.histogram}
            data-testid="chart-pane-histogram"
            d={toHistogramPath(scene.histogram, zeroGuideY)}
          />
        )}
        {scene.lines.map((ln) => {
          return (
            <polyline
              key={ln.key}
              className={styles.line}
              data-line={ln.key}
              fill="none"
              points={toPointsAttr(ln.points)}
            />
          );
        })}
      </svg>
      {crosshairStyle ? (
        <div
          className={styles.crosshairV}
          style={crosshairStyle}
          data-testid="chart-pane-crosshair-v"
        />
      ) : null}
      {readout ? (
        <div className={styles.readout} data-testid="chart-pane-readout">
          {readout.map((row) => {
            return (
              <span key={row.label}>
                {row.label} {row.txt}
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export interface IndicatorPaneProps {
  readonly kind: EqPaneKind;
  readonly scene: PaneScene;
  readonly readout: readonly PaneReadoutRow[] | null;
  readonly crosshairStyle: ChartVarStyle | null;
  /** ChartPlot's forwarded `paneHoverProps` (from `useChartGestures`) —
   * attached to this component's own root, the one element in the pane
   * that isn't `pointer-events: none`. */
  readonly hoverProps: PaneHoverProps;
}

/** The corner label, composed from the exported window/period constants
 * (never a hardcoded digit): "RSI 14" or "MACD 12 26 9". */
function paneLabel(kind: EqPaneKind): string {
  return kind === "rsi"
    ? `RSI ${RSI_WINDOW}`
    : `MACD ${MACD_FAST} ${MACD_SLOW} ${MACD_SIGNAL}`;
}

function toPointsAttr(points: readonly ChartPoint[]): string {
  return points
    .map((p) => {
      return `${p.x},${p.y}`;
    })
    .join(" ");
}

/** Batches every histogram bar into one `d` string (one `<path>` for the
 * whole pane, never one per bar): each bar is a `w`-wide, `h`-tall rect
 * whose top sits at the zero guide when the bar points down, or `h` above
 * it when the bar points up (see `PaneBar`'s doc comment) — the direction
 * reads from the rect's position relative to `zeroY`, not from a per-bar
 * fill. */
function toHistogramPath(bars: readonly PaneBar[], zeroY: number): string {
  return bars
    .map((b) => {
      const left = b.x - b.w / 2;
      const top = b.up ? zeroY - b.h : zeroY;
      return `M ${left} ${top} h ${b.w} v ${b.h} h ${-b.w} Z`;
    })
    .join(" ");
}
