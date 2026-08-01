import type { ReactElement } from "react";

import type { EqChartType } from "@rtc/client-core";
import type {
  ChartVm,
  CrosshairVm,
  NavigatorVm,
  VolumeBarVm,
} from "@rtc/motion-core";

import { BackfillChips } from "./BackfillChips";
import { BackToLiveButton } from "./BackToLiveButton";
import { CandleBars } from "./CandleBars";
import { CrosshairOverlay } from "./CrosshairOverlay";
import { NavigatorStrip } from "./NavigatorStrip";
import type { IndicatorPath } from "./SvgPathLayer";
import { SvgPathLayer } from "./SvgPathLayer";
import { TimeAxis } from "./TimeAxis";
import type { ChartGestures } from "./useChartGestures";
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
}: ChartPlotProps): ReactElement {
  return (
    <div className={styles.wrap}>
      <div
        className={styles.plot}
        data-testid="chart-plot"
        tabIndex={0}
        role="application"
        aria-label="Price chart"
        ref={plotRef}
        {...plotProps}
      >
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
        {kind === "candles" && <CandleBars candles={vm.candles} />}
        <SvgPathLayer
          linePoints={vm.linePoints}
          kind={kind}
          indicatorPaths={indicatorPaths}
        />
        <CrosshairOverlay vm={cross} />
        <BackfillChips
          loadingOlder={loadingOlder}
          historyStart={historyStart}
        />
        {!atLiveEdge && <BackToLiveButton onClick={onBackToLive} />}
      </div>
      <VolumePane bars={volumeBars} />
      <TimeAxis labels={vm.timeLabels} />
      <NavigatorStrip nav={nav} brushProps={navProps} />
    </div>
  );
}

export interface ChartPlotProps {
  readonly vm: ChartVm;
  readonly kind: EqChartType;
  readonly indicatorPaths: readonly IndicatorPath[];
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
}
