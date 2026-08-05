import type { ReactElement } from "react";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/**
 * Dumb multi-series line chart (SVG `<path>`, following `TileChart`'s
 * approach in the FX tile: hand-rolled min/max scaling, no charting
 * library) plus `hline`/`zone` annotations. Pure props-in, paint-out — no
 * state, no timers, no rxjs.
 */
export function PanelLine({
  series,
  annotations,
}: PanelLineProps): ReactElement {
  const allPoints = series.flatMap((s) => {
    return s.points;
  });

  if (allPoints.length === 0) {
    return <div className={styles.empty}>No data yet</div>;
  }

  const hlineValues = annotations
    .filter((a) => {
      return a.kind === "hline";
    })
    .map((a) => {
      return a.value;
    });

  const zoneValues = annotations
    .filter((a) => {
      return a.kind === "zone";
    })
    .flatMap((a) => {
      return [a.from, a.to];
    });

  const times = allPoints.map((p) => {
    return p.t;
  });
  const minT = Math.min(...times);
  const maxT = Math.max(...times);
  const rangeT = maxT - minT || 1;

  const values = [
    ...allPoints.map((p) => {
      return p.v;
    }),
    ...hlineValues,
    ...zoneValues,
  ];
  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const rangeV = maxV - minV || 1;

  function x(t: number): number {
    return PAD_X + ((t - minT) / rangeT) * (WIDTH - PAD_X * 2);
  }

  function y(v: number): number {
    return PAD_Y + (1 - (v - minV) / rangeV) * (HEIGHT - PAD_Y * 2);
  }

  function pathFor(points: PanelLineProps["series"][number]["points"]): string {
    return points
      .map((p, i) => {
        return `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <svg
      data-testid="jarvis-panel-line"
      className={styles.lineChart}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
    >
      <title>Panel line chart</title>
      {annotations.map((a) => {
        if (a.kind === "zone") {
          const key = `zone-${a.from}-${a.to}-${a.tone}`;
          const yTop = y(Math.max(a.from, a.to));
          const yBottom = y(Math.min(a.from, a.to));
          return (
            <rect
              key={key}
              data-tone={a.tone}
              className={styles.annotationZone}
              x={PAD_X}
              y={yTop}
              width={WIDTH - PAD_X * 2}
              height={Math.max(0, yBottom - yTop)}
            />
          );
        }

        const key = `hline-${a.value}-${a.tone}-${a.label ?? ""}`;
        return (
          <line
            key={key}
            data-tone={a.tone}
            className={styles.annotationLine}
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={y(a.value)}
            y2={y(a.value)}
          />
        );
      })}
      {series.map((s, i) => {
        return (
          <path
            key={s.label}
            data-series-index={i % SERIES_COLOR_COUNT}
            className={styles.seriesPath}
            d={pathFor(s.points)}
            fill="none"
          />
        );
      })}
    </svg>
  );
}

const WIDTH = 300;
const HEIGHT = 120;
const PAD_X = 8;
const PAD_Y = 10;
/** Cycled by series index — six accent tokens, matching the six `PanelTone`
 * values already in the theme (positive/negative/aware/primary/2/muted). */
const SERIES_COLOR_COUNT = 6;

// A named tag (rather than an inline `{ kind: "line" }` literal) so
// `Extract<PanelData, ...>` never takes an inline object type argument (mirrors
// JarvisMachine.ts's `ConfirmRequestTag`).
interface LineKindTag {
  readonly kind: "line";
}
export type PanelLineProps = Extract<PanelData, LineKindTag>;
