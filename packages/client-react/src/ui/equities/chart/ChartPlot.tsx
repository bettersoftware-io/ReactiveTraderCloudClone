import type { ReactElement } from "react";

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
import { DrawingsLayer } from "./DrawingsLayer";
import { IndicatorPane } from "./IndicatorPane";
import { NavigatorStrip } from "./NavigatorStrip";
import { SceneCanvas } from "./SceneCanvas";
import type { IndicatorPath } from "./SvgPathLayer";
import { SvgPathLayer } from "./SvgPathLayer";
import { TimeAxis } from "./TimeAxis";
import type { ChartGestures, PaneHoverProps } from "./useChartGestures";
import type { NavigatorStripProps } from "./useNavigatorBrush";
import { VolumePane } from "./VolumePane";

import styles from "./CandleChart.module.css";

/**
 * The plot's entire presentational render tree — grid, price labels,
 * candles/line/area, indicator overlays, crosshair, back-to-live, plus the
 * volume pane and time axis below the plot box — as a pure props leaf.
 * Extracted out of `CandleChart` (which still owns `useChartGestures` and
 * the `chartVm`/`crosshairVm`/indicator projections) so the visual tier's
 * forced-state scenarios (panned/zoomed/crosshair — viewport/cursor values
 * `useChartGestures`' own gesture-driven state can never reach
 * deterministically without synthetic pointer events) can mount this exact
 * DOM tree with literal injected state instead of duplicating it.
 * `plotProps`/`plotRef` are optional — omitting both yields a static,
 * gesture-free mount (no wheel/drag/keyboard wiring), which is exactly what
 * those forced-state wrappers need.
 */
export function ChartPlot({
  vm,
  kind,
  indicatorPaths,
  drawItems = [],
  cross,
  atLiveEdge,
  volumeBars,
  onBackToLive,
  plotProps,
  plotRef,
  nav,
  navProps,
  loadingOlder,
  historyStart,
  panes = [],
  paneCrosshairStyle = null,
  showHorizontal = true,
  paneHoverProps = NOOP_PANE_HOVER_PROPS,
  substrate = "dom",
  canvasPlot,
  canvasVolume,
}: ChartPlotProps): ReactElement {
  return (
    <div
      className={styles.wrap}
      data-panes={panes.length}
      data-yscale={vm.scale.yScale ?? "linear"}
    >
      <div
        className={styles.plot}
        data-testid="chart-plot"
        tabIndex={0}
        role="application"
        aria-label="Price chart"
        ref={plotRef}
        {...plotProps}
      >
        {substrate === "canvas" && canvasPlot ? (
          <SceneCanvas
            testid="chart-canvas-plot"
            summary={{
              "data-candles": String(canvasPlot.scene.candles.length),
              "data-drawings": String(
                canvasPlot.drawings.filter((d) => {
                  return d.id !== "draft";
                }).length,
              ),
              "data-compare": String(
                canvasPlot.scene.compareLinePoints.length > 0,
              ),
            }}
            draw={(ctx: Canvas2D, palette: ChartPalette, size: CanvasSize) => {
              drawPlotScene(ctx, canvasPlot, palette, size);
            }}
          />
        ) : (
          <>
            {vm.grid.map((gr) => {
              return (
                <div
                  key={gr.key}
                  className={styles.grid}
                  style={gr.style}
                  data-testid="chart-grid-line"
                />
              );
            })}
            {kind === "candles" && <CandleBars candles={vm.candles} />}
            <SvgPathLayer
              linePoints={vm.linePoints}
              kind={kind}
              indicatorPaths={indicatorPaths}
              comparePoints={vm.compareLinePoints}
            />
            <DrawingsLayer items={drawItems} />
          </>
        )}
        {vm.labels.map((l) => {
          return (
            <div
              key={l.key}
              className={styles.label}
              style={l.style}
              data-testid="chart-price-label"
            >
              {l.txt}
            </div>
          );
        })}
        <CrosshairOverlay
          vm={cross}
          showHorizontal={showHorizontal}
          linesHidden={substrate === "canvas"}
        />
        <BackfillChips
          loadingOlder={loadingOlder}
          historyStart={historyStart}
        />
        {!atLiveEdge && <BackToLiveButton onClick={onBackToLive} />}
      </div>
      <VolumePane bars={volumeBars} canvasBars={canvasVolume} />
      {panes.map((p) => {
        return (
          <IndicatorPane
            key={p.kind}
            kind={p.kind}
            scene={p.scene}
            readout={p.readout}
            crosshairStyle={paneCrosshairStyle}
            hoverProps={paneHoverProps}
            substrate={substrate}
          />
        );
      })}
      <TimeAxis labels={vm.timeLabels} />
      <NavigatorStrip nav={nav} brushProps={navProps} />
    </div>
  );
}

/** A no-op fallback for the visual tier's forced-state wrappers, which
 * mount `ChartPlot` directly without going through `useChartGestures` (see
 * `EquitiesChartInteractive.visual.tsx`) — never reached in the real app,
 * where `CandleChart` always supplies the live `paneHoverProps`. */
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
   * defaults to `"dom"` (unchanged geometry). Forwarded to every rendered
   * `IndicatorPane`; `"canvas"` swaps this component's own geometry
   * children for a `chart-canvas-plot` `SceneCanvas` when `canvasPlot` is
   * also supplied. */
  readonly substrate?: ChartSubstrate;
  /** The plot's canvas-mode scene (candles/line/area, overlays, drawings,
   * crosshair) — required for the canvas arm to render; omitted in DOM
   * mode. */
  readonly canvasPlot?: PlotCanvasScene;
  /** The volume pane's canvas-mode bars — forwarded verbatim to
   * `VolumePane`'s `canvasBars`; omitted in DOM mode. */
  readonly canvasVolume?: readonly VolumeSceneBar[];
}
