import { createMemo, type JSX } from "solid-js";

import type { Candle } from "@rtc/domain";
import {
  type ChartVm,
  chartVm,
  crosshairVm,
  defaultViewport,
  type EqPaneKind,
  isAtLiveEdge,
  navigatorVm,
  paneReadout,
  paneScene,
  volumeVm,
} from "@rtc/motion-core";

import type { PaneVm } from "#/ui/equities/chart/ChartPlot";
import { ChartPlot } from "#/ui/equities/chart/ChartPlot";

/**
 * Golden-only wrapper components for the indicator panes' forced-state
 * scenarios (Task 7 of the indicator-panes plan, design spec
 * 2026-08-02-indicator-panes-design.md): RSI solo (no crosshair — the pane's
 * plotted geometry alone) and RSI+MACD together with a forced crosshair so
 * both panes' live readouts render. Same bypass as
 * `EquitiesChartInteractive.visual.tsx`'s `ForcedChart`: `CandleChart` owns
 * its viewport/cursor via `createChartGestures` (no prop seam), so this
 * mounts the extracted, purely presentational `ChartPlot` directly with a
 * literal viewport/cursor and `panes` projected via the same
 * `@rtc/motion-core` `paneScene`/`paneReadout` functions `CandleChart`
 * itself calls — instead of driving a real pill-click + gesture sequence
 * (out of scope for the visual tier). The candle series/constants are
 * duplicated (not imported) from `EquitiesChartInteractive.visual.tsx` for
 * the same reason that file gives: each visual wrapper stays self-contained
 * per client.
 */

// Same formula as EquitiesChartInteractive.visual.tsx's candleAt/CANDLES —
// see that file's doc comment for why it's duplicated rather than shared.
// 300 candles + defaultVisible 60 puts the default viewport at {240, 300},
// the same window ChartPanes.contract.spec.ts's mountChart uses; a plot-centre
// (0.5, 0.5) cursor there lands on series index 270, comfortably past every
// pane's warm-up window (RSI_WINDOW=14, MACD's slow/signal warm-up) so both
// readouts render real numbers rather than the em-dash.
const CANDLE_COUNT = 300;
const BUCKET_MS = 60_000;
const DEFAULT_VISIBLE = 60;

const STAGE_STYLE: JSX.CSSProperties = {
  width: "760px",
  height: "420px",
  display: "flex",
  "flex-direction": "column",
};

function candleAt(i: number): Candle {
  const open = 100 + i;
  const close = i % 2 === 0 ? open + 1 : open - 1;

  return {
    time: i * BUCKET_MS,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
    volume: 1_000_000 + i * 1_000,
  };
}

const CANDLES: readonly Candle[] = Array.from(
  { length: CANDLE_COUNT },
  (_, i) => {
    return candleAt(i);
  },
);
const LIVE_RATE: number = (CANDLES[CANDLES.length - 1] ?? candleAt(0)).close;
const CLOSES: readonly number[] = CANDLES.map((c) => {
  return c.close;
});

export function EquitiesChartPaneRsi(): JSX.Element {
  return (
    <div style={STAGE_STYLE}>
      <ForcedPaneChart panes={["rsi"]} />
    </div>
  );
}

export function EquitiesChartPanesBoth(): JSX.Element {
  return (
    <div style={STAGE_STYLE}>
      <ForcedPaneChart
        panes={["rsi", "macd"]}
        cursor={{ xFrac: 0.5, yFrac: 0.5 }}
      />
    </div>
  );
}

interface ForcedPaneChartProps {
  readonly panes: readonly EqPaneKind[];
  /** Omit for a crosshair-free mount (RSI solo — the pane geometry alone,
   * every readout null). */
  readonly cursor?: { readonly xFrac: number; readonly yFrac: number };
}

/** Mounts the real `ChartPlot` with a literal viewport and the requested
 * panes projected via `paneScene`/`paneReadout` — see the file doc above. */
function ForcedPaneChart(props: ForcedPaneChartProps): JSX.Element {
  const viewport = defaultViewport(CANDLE_COUNT, DEFAULT_VISIBLE);

  const vm = createMemo((): ChartVm => {
    return chartVm(CANDLES, LIVE_RATE, false, { viewport, kind: "candles" });
  });

  const cross = createMemo(() => {
    const cursor = props.cursor;

    if (!cursor) {
      return null;
    }

    return crosshairVm(
      cursor.xFrac,
      cursor.yFrac,
      CANDLES,
      viewport,
      vm().scale,
    );
  });

  const atLiveEdge = createMemo(() => {
    return isAtLiveEdge(viewport, CANDLE_COUNT);
  });

  const paneVms = createMemo((): readonly PaneVm[] => {
    const crossVm = cross();

    return props.panes.map((kind) => {
      return {
        kind,
        scene: paneScene(kind, CLOSES, viewport),
        readout: crossVm ? paneReadout(kind, CLOSES, crossVm.idx) : null,
      };
    });
  });

  return (
    <ChartPlot
      vm={vm()}
      kind="candles"
      indicatorPaths={[]}
      cross={cross()}
      atLiveEdge={atLiveEdge()}
      volumeBars={volumeVm(CANDLES, viewport)}
      onBackToLive={() => {}}
      nav={navigatorVm(CANDLES, viewport)}
      loadingOlder={false}
      historyStart={false}
      panes={paneVms()}
      paneCrosshairStyle={cross()?.style ?? null}
    />
  );
}
