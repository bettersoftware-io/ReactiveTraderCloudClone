import { type Accessor, createUniqueId, Index, type JSX, Show } from "solid-js";

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
export function SvgPathLayer(props: SvgPathLayerProps): JSX.Element {
  // Same route as PnlChart.tsx/ThroughputChart.tsx for a gradient defs id
  // referenced by fill: a build-time-stable literal CSS selector can't name
  // a per-instance id, so the id is generated with createUniqueId() (Solid's
  // useId() equivalent) and threaded to the fill as a `url(#...)` JSX
  // ATTRIBUTE (never a CSS rule) — the same "presentation attribute, not a
  // CSS declaration" route as this file's own fill="none"/stroke="none"
  // below.
  const gradientId = createUniqueId();

  return (
    <svg
      class={styles.layer}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" class={styles.gradTop} />
          <stop offset="100%" class={styles.gradBottom} />
        </linearGradient>
      </defs>
      <Show when={props.kind === "area" && props.linePoints.length > 1}>
        <path
          data-testid="chart-path-area"
          fill={`url(#${gradientId})`}
          stroke="none"
          d={toAreaPath(props.linePoints)}
        />
      </Show>
      <Show when={props.kind !== "candles" && props.linePoints.length > 1}>
        <polyline
          data-testid="chart-path-line"
          class={styles.line}
          fill="none"
          points={toPointsAttr(props.linePoints)}
        />
      </Show>
      <Index each={props.indicatorPaths}>
        {(p: Accessor<IndicatorPath>): JSX.Element => {
          return (
            <polyline
              data-testid="chart-indicator-path"
              data-ind={p().id}
              class={styles.indicator}
              fill="none"
              points={p().pointsAttr}
            />
          );
        }}
      </Index>
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
