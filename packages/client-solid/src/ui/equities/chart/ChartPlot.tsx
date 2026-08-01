import { type Accessor, Index, type JSX, Show } from "solid-js";

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
import type { ChartGestures } from "./createChartGestures";
import type { NavigatorStripProps } from "./createNavigatorBrush";
import { NavigatorStrip } from "./NavigatorStrip";
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
    <div class={styles.wrap}>
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
        <Show when={props.kind === "candles"}>
          <CandleBars candles={props.vm.candles} />
        </Show>
        <SvgPathLayer
          linePoints={props.vm.linePoints}
          kind={props.kind}
          indicatorPaths={props.indicatorPaths}
        />
        <CrosshairOverlay vm={props.cross} />
        <BackfillChips
          loadingOlder={props.loadingOlder}
          historyStart={props.historyStart}
        />
        <Show when={!props.atLiveEdge}>
          <BackToLiveButton onClick={props.onBackToLive} />
        </Show>
      </div>
      <VolumePane bars={props.volumeBars} />
      <TimeAxis labels={props.vm.timeLabels} />
      <NavigatorStrip nav={props.nav} brushProps={props.navProps} />
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
