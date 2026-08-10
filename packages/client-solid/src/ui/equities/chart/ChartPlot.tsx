import { type Accessor, Index, type JSX, Show } from "solid-js";

import type { EqChartType } from "@rtc/client-core";
import type { ChartSubstrate } from "@rtc/domain";
import {
  type Canvas2D,
  type CanvasSize,
  type ChartPalette,
  type ChartVarStyle,
  type ChartVm,
  type CrosshairVm,
  type DrawingSceneItem,
  drawPlotScene,
  type EqPaneKind,
  type NavigatorVm,
  type PaneReadoutRow,
  type PaneScene,
  type PlotCanvasScene,
  type VolumeBarVm,
  type VolumeSceneBar,
} from "@rtc/motion-core";

import { BackfillChips } from "./BackfillChips";
import { BackToLiveButton } from "./BackToLiveButton";
import { CandleBars } from "./CandleBars";
import { CrosshairOverlay } from "./CrosshairOverlay";
import type { ChartGestures, PaneHoverProps } from "./createChartGestures";
import type { NavigatorStripProps } from "./createNavigatorBrush";
import { DrawingsLayer } from "./DrawingsLayer";
import { IndicatorPane } from "./IndicatorPane";
import { NavigatorStrip } from "./NavigatorStrip";
import { SceneCanvas } from "./SceneCanvas";
import type { IndicatorPath } from "./SvgPathLayer";
import { SvgPathLayer } from "./SvgPathLayer";
import { TimeAxis } from "./TimeAxis";
import { VolumePane } from "./VolumePane";

import styles from "./CandleChart.module.css";

/**
 * The plot's entire presentational render tree — grid, price labels,
 * candles/line/area, indicator overlays, crosshair, back-to-live, plus the
 * volume pane and time axis below the plot box — as a pure props leaf.
 * Extracted out of `CandleChart` (which still owns `createChartGestures` and
 * the `chartVm`/`crosshairVm`/indicator projections) so the visual tier's
 * forced-state scenarios (panned/zoomed/crosshair — viewport/cursor values
 * `createChartGestures`' own gesture-driven state can never reach
 * deterministically without synthetic pointer events) can mount this exact
 * DOM tree with literal injected state instead of duplicating it.
 * `plotProps`/`plotRef` are optional — omitting both yields a static,
 * gesture-free mount (no wheel/drag/keyboard wiring), which is exactly what
 * those forced-state wrappers need.
 */
export function ChartPlot(props: ChartPlotProps): JSX.Element {
  return (
    <div
      class={styles.wrap}
      data-panes={(props.panes ?? []).length}
      data-yscale={props.vm.scale.yScale ?? "linear"}
    >
      <div
        class={styles.plot}
        data-testid="chart-plot"
        tabIndex={0}
        role="application"
        aria-label="Price chart"
        ref={props.plotRef}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerDown={props.plotProps?.onPointerDown}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerMove={props.plotProps?.onPointerMove}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerUp={props.plotProps?.onPointerUp}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerCancel={props.plotProps?.onPointerCancel}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onPointerLeave={props.plotProps?.onPointerLeave}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onDblClick={props.plotProps?.onDblClick}
        // eslint-disable-next-line solid/reactivity -- native event-handler binding of a props callback is a live reference in Solid JSX
        onKeyDown={props.plotProps?.onKeyDown}
      >
        <Index each={props.vm.labels}>
          {(l: Accessor<ChartVm["labels"][number]>): JSX.Element => {
            return (
              <div
                class={styles.label}
                style={l().style}
                data-testid="chart-price-label"
              >
                {l().txt}
              </div>
            );
          }}
        </Index>
        <Show
          when={props.substrate === "canvas" && props.canvasPlot}
          fallback={
            <>
              <Index each={props.vm.grid}>
                {(gr: Accessor<ChartVm["grid"][number]>): JSX.Element => {
                  return (
                    <div
                      class={styles.grid}
                      style={gr().style}
                      data-testid="chart-grid-line"
                    />
                  );
                }}
              </Index>
              <Show when={props.kind === "candles"}>
                <CandleBars candles={props.vm.candles} />
              </Show>
              <SvgPathLayer
                linePoints={props.vm.linePoints}
                kind={props.kind}
                indicatorPaths={props.indicatorPaths}
                comparePoints={props.vm.compareLinePoints}
              />
              <DrawingsLayer items={props.drawItems ?? []} />
            </>
          }
        >
          {(canvasPlot: Accessor<PlotCanvasScene>): JSX.Element => {
            return (
              <SceneCanvas
                testid="chart-canvas-plot"
                summary={{
                  "data-candles": String(canvasPlot().scene.candles.length),
                  "data-drawings": String(
                    canvasPlot().drawings.filter((d) => {
                      return d.id !== "draft";
                    }).length,
                  ),
                  "data-compare": String(
                    canvasPlot().scene.compareLinePoints.length > 0,
                  ),
                }}
                draw={(
                  ctx: Canvas2D,
                  palette: ChartPalette,
                  size: CanvasSize,
                ) => {
                  drawPlotScene(ctx, canvasPlot(), palette, size);
                }}
              />
            );
          }}
        </Show>
        <CrosshairOverlay
          vm={props.cross}
          showHorizontal={props.showHorizontal ?? true}
          linesHidden={props.substrate === "canvas"}
        />
        <BackfillChips
          loadingOlder={props.loadingOlder}
          historyStart={props.historyStart}
        />
        <Show when={!props.atLiveEdge}>
          <BackToLiveButton onClick={props.onBackToLive} />
        </Show>
      </div>
      <VolumePane bars={props.volumeBars} canvasBars={props.canvasVolume} />
      <Index each={props.panes ?? []}>
        {(p: Accessor<PaneVm>): JSX.Element => {
          return (
            <IndicatorPane
              kind={p().kind}
              scene={p().scene}
              readout={p().readout}
              crosshairStyle={props.paneCrosshairStyle ?? null}
              hoverProps={props.paneHoverProps ?? NOOP_PANE_HOVER_PROPS}
              substrate={props.substrate}
            />
          );
        }}
      </Index>
      <TimeAxis labels={props.vm.timeLabels} />
      <NavigatorStrip nav={props.nav} brushProps={props.navProps} />
    </div>
  );
}

/** A no-op fallback for the visual tier's forced-state wrappers, which
 * mount `ChartPlot` directly without going through `createChartGestures`
 * (see `EquitiesChartInteractive.visual.tsx`) — never reached in the real
 * app, where `CandleChart` always supplies the live `paneHoverProps`. */
const NOOP_PANE_HOVER_PROPS: PaneHoverProps = {
  onPointerMove: () => {},
  onPointerLeave: () => {},
};

/** One active pane's projected geometry + live readout — `CandleChart`
 * computes this per entry in the workspace's `panes` set via `paneScene`/
 * `paneReadout`; `ChartPlot` just maps it onto `IndicatorPane`. */
export interface PaneVm {
  readonly kind: EqPaneKind;
  readonly scene: PaneScene;
  readonly readout: readonly PaneReadoutRow[] | null;
}

export interface ChartPlotProps {
  readonly vm: ChartVm;
  readonly kind: EqChartType;
  readonly indicatorPaths: readonly IndicatorPath[];
  /** Chart annotations (trendlines/horizontal levels), pre-projected by
   * `@rtc/motion-core`'s `drawingScene` — omit for a drawing-free mount
   * (defaults to none, same convention as `panes`). */
  readonly drawItems?: readonly DrawingSceneItem[];
  readonly cross: CrosshairVm | null;
  readonly atLiveEdge: boolean;
  readonly volumeBars: readonly VolumeBarVm[];
  readonly onBackToLive: () => void;
  /** Omit for a static/gesture-free mount — see the file doc above. */
  readonly plotProps?: ChartGestures["plotProps"];
  readonly plotRef?: ChartGestures["plotRef"];
  readonly nav: NavigatorVm;
  /** Omit for a static/brush-free navigator — same convention as plotProps. */
  readonly navProps?: NavigatorStripProps;
  readonly loadingOlder: boolean;
  readonly historyStart: boolean;
  /** The active RSI/MACD panes, in order — omit for a pane-free mount (the
   * visual tier's forced-state wrappers construct `ChartPlot` directly with
   * no pane data; see the file doc above). */
  readonly panes?: readonly PaneVm[];
  /** The shared crosshair echo style (`cross?.style ?? null`), rendered as
   * each pane's own vertical hairline — omit alongside `panes`. */
  readonly paneCrosshairStyle?: ChartVarStyle | null;
  /** Whether the main plot's own horizontal hairline should show — false
   * while the hover has moved into a pane instead. Defaults to true so a
   * `ChartPlot` built without pane wiring (same forced-state wrappers) keeps
   * its pre-pane crosshair behaviour unchanged. */
  readonly showHorizontal?: boolean;
  /** Forwarded onto every rendered `IndicatorPane` — omit alongside `panes`. */
  readonly paneHoverProps?: PaneHoverProps;
  /** The rendering substrate for the plot/volume/pane geometry layers —
   * `"canvas"` swaps grid/candles/overlay-lines/drawings for one
   * `SceneCanvas`, the volume bars for another, and each `IndicatorPane`'s
   * SVG geometry for a third; text (labels, readouts, chips) always stays
   * DOM. Omit for the pre-substrate DOM behaviour. */
  readonly substrate?: ChartSubstrate;
  /** The canvas-substrate plot scene — required alongside
   * `substrate === "canvas"` to render `chart-canvas-plot`; omitted (or
   * substrate !== "canvas") keeps the DOM geometry arm. */
  readonly canvasPlot?: PlotCanvasScene;
  /** The canvas-substrate volume bars, forwarded to `VolumePane` — omitted
   * (or substrate !== "canvas") keeps `VolumePane`'s own DOM bars. */
  readonly canvasVolume?: readonly VolumeSceneBar[];
}
