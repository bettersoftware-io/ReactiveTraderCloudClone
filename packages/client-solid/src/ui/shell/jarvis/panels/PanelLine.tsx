import type { Accessor, JSX } from "solid-js";
import { createMemo, For, Show } from "solid-js";

import type { PanelData } from "@rtc/client-core";

import styles from "./panels.module.css";

/**
 * Dumb multi-series line chart (SVG `<path>`, following `TileChart`'s
 * approach in the FX tile: hand-rolled min/max scaling, no charting
 * library) plus `hline`/`zone` annotations. Pure props-in, paint-out — no
 * state, no timers, no rxjs.
 *
 * The min/max scale is derived in one `createMemo` (re-run whenever
 * `props.series`/`props.annotations` change); `<For>` over the raw
 * series/annotation arrays redraws the SVG children on every tick — there is
 * no `.flashOnChange` on these elements (unlike PanelTable/SparkGrid/
 * Heatmap), so unkeyed redraw-on-tick carries no CSS-retrigger risk.
 */
export function PanelLine(props: PanelLineProps): JSX.Element {
  const scale = createMemo((): ChartScale | null => {
    const allPoints = props.series.flatMap((s) => {
      return s.points;
    });

    if (allPoints.length === 0) {
      return null;
    }

    const hlineValues = props.annotations
      .filter((a) => {
        return a.kind === "hline";
      })
      .map((a) => {
        return a.value;
      });

    const zoneValues = props.annotations
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

    return { minT, rangeT, minV, rangeV };
  });

  return (
    <Show when={scale()} fallback={<div class={styles.empty}>No data yet</div>}>
      {(currentScale: Accessor<ChartScale>): JSX.Element => {
        function x(t: number): number {
          const s = currentScale();
          return PAD_X + ((t - s.minT) / s.rangeT) * (WIDTH - PAD_X * 2);
        }

        function y(v: number): number {
          const s = currentScale();
          return PAD_Y + (1 - (v - s.minV) / s.rangeV) * (HEIGHT - PAD_Y * 2);
        }

        function pathFor(points: SeriesPoints): string {
          return points
            .map((p, i) => {
              return `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
            })
            .join(" ");
        }

        return (
          <svg
            data-testid="jarvis-panel-line"
            class={styles.lineChart}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
          >
            <title>Panel line chart</title>
            <For each={props.annotations}>
              {(a: PanelLineProps["annotations"][number]): JSX.Element => {
                if (a.kind === "zone") {
                  const yTop = y(Math.max(a.from, a.to));
                  const yBottom = y(Math.min(a.from, a.to));
                  return (
                    <rect
                      data-tone={a.tone}
                      class={styles.annotationZone}
                      x={PAD_X}
                      y={yTop}
                      width={WIDTH - PAD_X * 2}
                      height={Math.max(0, yBottom - yTop)}
                    />
                  );
                }

                return (
                  <line
                    data-tone={a.tone}
                    class={styles.annotationLine}
                    x1={PAD_X}
                    x2={WIDTH - PAD_X}
                    y1={y(a.value)}
                    y2={y(a.value)}
                  />
                );
              }}
            </For>
            <For each={props.series}>
              {(
                ser: PanelLineProps["series"][number],
                i: Accessor<number>,
              ): JSX.Element => {
                return (
                  <path
                    data-series-index={i() % SERIES_COLOR_COUNT}
                    class={styles.seriesPath}
                    d={pathFor(ser.points)}
                    fill="none"
                  />
                );
              }}
            </For>
          </svg>
        );
      }}
    </Show>
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
// react's PanelLine.tsx / JarvisMachine.ts's `ConfirmRequestTag`).
interface LineKindTag {
  readonly kind: "line";
}
export type PanelLineProps = Extract<PanelData, LineKindTag>;
type SeriesPoints = PanelLineProps["series"][number]["points"];

interface ChartScale {
  readonly minT: number;
  readonly rangeT: number;
  readonly minV: number;
  readonly rangeV: number;
}
