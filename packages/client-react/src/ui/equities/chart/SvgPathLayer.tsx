import type { ReactElement } from "react";

import type { ChartKind, ChartPoint, IndicatorId } from "@rtc/motion-core";

import styles from "./SvgPathLayer.module.css";

/**
 * The plot's single SVG element: the close-price line/area (line & area
 * kinds only) plus any active indicator overlays (SMA/EMA — every kind).
 * Pure markup — every number arrives pre-projected into the 0-100 viewBox
 * by @rtc/motion-core; this component only stringifies points/paths and
 * applies classes (vm owns numbers, shell owns markup strings). Nothing
 * here animates. `vector-effect: non-scaling-stroke` (module css) keeps
 * stroke width uniform under `preserveAspectRatio="none"`'s non-uniform
 * scale.
 */
export function SvgPathLayer({
  linePoints,
  kind,
  indicatorPaths,
}: SvgPathLayerProps): ReactElement {
  const pointsAttr = toPointsAttr(linePoints);
  const areaD = toAreaPath(linePoints);

  return (
    <svg
      className={styles.layer}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="eqAreaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className={styles.gradTop} />
          <stop offset="100%" className={styles.gradBottom} />
        </linearGradient>
      </defs>
      {kind === "area" && linePoints.length > 1 && (
        <path
          data-testid="chart-path-area"
          className={styles.area}
          stroke="none"
          d={areaD}
        />
      )}
      {kind !== "candles" && linePoints.length > 1 && (
        <polyline
          data-testid="chart-path-line"
          className={styles.line}
          fill="none"
          points={pointsAttr}
        />
      )}
      {indicatorPaths.map((p) => {
        return (
          <polyline
            key={p.id}
            data-testid="chart-indicator-path"
            data-ind={p.id}
            className={styles.indicator}
            fill="none"
            points={p.pointsAttr}
          />
        );
      })}
    </svg>
  );
}

/** One overlay indicator's already-joined SVG `points` attribute string —
 * see `CandleChart`, which projects `indicatorValues`/`indicatorPoints`
 * (@rtc/motion-core) into this shape before handing it down. */
export interface IndicatorPath {
  readonly id: IndicatorId;
  readonly pointsAttr: string;
}

export interface SvgPathLayerProps {
  readonly linePoints: readonly ChartPoint[];
  readonly kind: ChartKind;
  readonly indicatorPaths: readonly IndicatorPath[];
}

function toPointsAttr(points: readonly ChartPoint[]): string {
  return points
    .map((p) => {
      return `${p.x},${p.y}`;
    })
    .join(" ");
}

function toAreaPath(points: readonly ChartPoint[]): string {
  const first = points[0];
  const last = points[points.length - 1];

  if (!first || !last) {
    return "";
  }

  return `M ${first.x} 100 L ${toPointsAttr(points)} L ${last.x} 100 Z`;
}
