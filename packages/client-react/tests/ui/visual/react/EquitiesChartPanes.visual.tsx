import type { ReactElement } from "react";

import type { Candle } from "@rtc/domain";
import {
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
 * its viewport/cursor via `useChartGestures` (no prop seam), so this mounts
 * the extracted, purely presentational `ChartPlot` directly with a literal
 * viewport/cursor and `panes` projected via the same `@rtc/motion-core`
 * `paneScene`/`paneReadout` functions `CandleChart` itself calls — instead
 * of driving a real pill-click + gesture sequence (out of scope for the
 * visual tier).
 *
 * Two separate candle fixtures, deliberately: RSI solo reuses
 * `EquitiesChartInteractive.visual.tsx`'s smooth, near-monotonic
 * candleAt/CANDLES series (duplicated, not imported — each visual wrapper
 * stays self-contained per client). RSI's fixed 0-100 scale reads fine
 * against that series, but MACD does not — it settles into an exact
 * period-2 steady state well before the visible window, pinning macd/signal
 * within ~1px of PANE_Y_TOP and squashing the histogram to sub-pixel bars
 * (macdScale ends up dominated by values elsewhere in the window), which
 * made crossovers, macd/signal separation, and histogram direction all
 * pixel-invisible in the both-panes golden. `chart-panes-both` gets its own
 * host-local zigzag fixture instead (the BOTH_* constants below): fixed-
 * length up/down legs that reverse direction every `BOTH_LEG_LEN` candles
 * (four full reversals across the 60-candle visible window), so MACD and
 * its signal visibly diverge and cross, and the histogram swings both
 * directions with multi-pixel bars. Deterministic (literal formula, no
 * Math.random) with the same 300-candle/60-visible warm-up margin as the
 * RSI-solo fixture.
 */

// RSI-solo fixture — same formula as EquitiesChartInteractive.visual.tsx's
// candleAt/CANDLES. 300 candles + defaultVisible 60 puts the default
// viewport at {240, 300}, the same window ChartPanes.contract.spec.ts's
// mountChart uses.
const CANDLE_COUNT = 300;
const BUCKET_MS = 60_000;
const DEFAULT_VISIBLE = 60;

const STAGE_STYLE = {
  width: 760,
  height: 420,
  display: "flex",
  flexDirection: "column",
} as const;

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

// "chart-panes-both" fixture — a deterministic zigzag: fixed-length legs
// that reverse direction every BOTH_LEG_LEN candles, so MACD/signal cross
// repeatedly over the visible window and the histogram renders visible bars
// in both directions. See the file doc above for why RSI-solo's smoother
// series doesn't exercise MACD's rendering.
const BOTH_LEG_LEN = 15;
const BOTH_STEP = 2;
const BOTH_START_PRICE = 200;

function bothLegDirection(i: number): 1 | -1 {
  return Math.floor(i / BOTH_LEG_LEN) % 2 === 0 ? 1 : -1;
}

function buildZigzagCandles(): readonly Candle[] {
  const out: Candle[] = [];
  let prevClose = BOTH_START_PRICE;

  for (let i = 0; i < CANDLE_COUNT; i++) {
    const open = prevClose;
    const close = open + bothLegDirection(i) * BOTH_STEP;

    out.push({
      time: i * BUCKET_MS,
      open,
      high: Math.max(open, close) + 1,
      low: Math.min(open, close) - 1,
      close,
      volume: 1_000_000 + i * 1_000,
    });
    prevClose = close;
  }

  return out;
}

const CANDLES_BOTH: readonly Candle[] = buildZigzagCandles();
const LIVE_RATE_BOTH: number = (
  CANDLES_BOTH[CANDLES_BOTH.length - 1] ?? CANDLES_BOTH[0]
).close;

const CLOSES_BOTH: readonly number[] = CANDLES_BOTH.map((c) => {
  return c.close;
});

export function EquitiesChartPaneRsi(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <ForcedPaneChart
        candles={CANDLES}
        closes={CLOSES}
        liveRate={LIVE_RATE}
        panes={["rsi"]}
      />
    </div>
  );
}

export function EquitiesChartPanesBoth(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <ForcedPaneChart
        candles={CANDLES_BOTH}
        closes={CLOSES_BOTH}
        liveRate={LIVE_RATE_BOTH}
        panes={["rsi", "macd"]}
        cursor={{ xFrac: 0.5, yFrac: 0.5 }}
      />
    </div>
  );
}

interface ForcedPaneChartProps {
  readonly candles: readonly Candle[];
  readonly closes: readonly number[];
  readonly liveRate: number;
  readonly panes: readonly EqPaneKind[];
  /** Omit for a crosshair-free mount (RSI solo — the pane geometry alone,
   * every readout null). */
  readonly cursor?: { readonly xFrac: number; readonly yFrac: number };
}

/** Mounts the real `ChartPlot` with a literal viewport and the requested
 * panes projected via `paneScene`/`paneReadout` — see the file doc above. */
function ForcedPaneChart({
  candles,
  closes,
  liveRate,
  panes,
  cursor,
}: ForcedPaneChartProps): ReactElement {
  const viewport = defaultViewport(candles.length, DEFAULT_VISIBLE);
  const vm = chartVm(candles, liveRate, false, { viewport, kind: "candles" });
  const cross = cursor
    ? crosshairVm(cursor.xFrac, cursor.yFrac, candles, viewport, vm.scale)
    : null;
  const atLiveEdge = isAtLiveEdge(viewport, candles.length);
  const paneVms: readonly PaneVm[] = panes.map((kind) => {
    return {
      kind,
      scene: paneScene(kind, closes, viewport),
      readout: cross ? paneReadout(kind, closes, cross.idx) : null,
    };
  });

  return (
    <ChartPlot
      vm={vm}
      kind="candles"
      indicatorPaths={[]}
      cross={cross}
      atLiveEdge={atLiveEdge}
      volumeBars={volumeVm(candles, viewport)}
      onBackToLive={() => {}}
      nav={navigatorVm(candles, viewport)}
      loadingOlder={false}
      historyStart={false}
      panes={paneVms}
      paneCrosshairStyle={cross?.style ?? null}
    />
  );
}
