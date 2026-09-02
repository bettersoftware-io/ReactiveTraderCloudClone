import { type Accessor, Index, type JSX, Show } from "solid-js";

import type { ChartSubstrate } from "@rtc/domain";
import {
  type Canvas2D,
  type CanvasSize,
  type ChartPalette,
  type ChartPoint,
  type ChartVarStyle,
  drawPaneScene,
  type EqPaneKind,
  MACD_FAST,
  MACD_SIGNAL,
  MACD_SLOW,
  type PaneBar,
  type PaneGuide,
  type PaneLine,
  type PaneReadoutRow,
  type PaneScene,
  RSI_WINDOW,
} from "@rtc/motion-core";

import type { PaneHoverProps } from "./createChartGestures";
import { SceneCanvas } from "./SceneCanvas";

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
export function IndicatorPane(props: IndicatorPaneProps): JSX.Element {
  function trackPaneCursor(e: PointerEvent): void {
    props.hoverProps.onPointerMove(e);
  }

  function clearPaneCursor(): void {
    props.hoverProps.onPointerLeave();
  }

  return (
    <div
      class={styles.pane}
      data-testid={`chart-pane-${props.kind}`}
      onPointerMove={trackPaneCursor}
      onPointerLeave={clearPaneCursor}
    >
      <span class={styles.label}>{paneLabel(props.kind)}</span>
      <Show
        when={props.substrate === "canvas"}
        fallback={
          <svg
            class={styles.svg}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <Index each={props.scene.guides}>
              {(g: Accessor<PaneGuide>): JSX.Element => {
                return (
                  <line
                    class={styles.guide}
                    x1="0"
                    y1={g().y}
                    x2="100"
                    y2={g().y}
                  />
                );
              }}
            </Index>
            <Show when={props.scene.histogram.length > 0}>
              <path
                class={styles.histogram}
                data-testid="chart-pane-histogram"
                d={toHistogramPath(
                  props.scene.histogram,
                  props.scene.guides[0]?.y ?? 50,
                )}
              />
            </Show>
            <Index each={props.scene.lines}>
              {(ln: Accessor<PaneLine>): JSX.Element => {
                return (
                  <polyline
                    class={styles.line}
                    data-line={ln().key}
                    fill="none"
                    points={toPointsAttr(ln().points)}
                  />
                );
              }}
            </Index>
          </svg>
        }
      >
        <SceneCanvas
          testid="chart-canvas-pane"
          draw={(ctx: Canvas2D, palette: ChartPalette, size: CanvasSize) => {
            drawPaneScene(ctx, props.scene, palette, size);
          }}
        />
      </Show>
      <Show when={props.crosshairStyle}>
        {(style: () => ChartVarStyle): JSX.Element => {
          return (
            <div
              class={styles.crosshairV}
              style={style()}
              data-testid="chart-pane-crosshair-v"
            />
          );
        }}
      </Show>
      <Show when={props.readout}>
        {(readout: () => readonly PaneReadoutRow[]): JSX.Element => {
          return (
            <div class={styles.readout} data-testid="chart-pane-readout">
              <Index each={readout()}>
                {(row: Accessor<PaneReadoutRow>): JSX.Element => {
                  return (
                    <span>
                      {row().label} {row().txt}
                    </span>
                  );
                }}
              </Index>
            </div>
          );
        }}
      </Show>
    </div>
  );
}

export interface IndicatorPaneProps {
  readonly kind: EqPaneKind;
  readonly scene: PaneScene;
  readonly readout: readonly PaneReadoutRow[] | null;
  readonly crosshairStyle: ChartVarStyle | null;
  /** ChartPlot's forwarded `paneHoverProps` (from `createChartGestures`) —
   * attached to this component's own root, the one element in the pane
   * that isn't `pointer-events: none`. */
  readonly hoverProps: PaneHoverProps;
  /** `"canvas"` replaces this pane's SVG geometry (guides/histogram/lines)
   * with one `SceneCanvas`; the label, crosshair echo, and readout stay
   * DOM either way. Omit for the pre-substrate DOM behaviour. */
  readonly substrate?: ChartSubstrate;
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
