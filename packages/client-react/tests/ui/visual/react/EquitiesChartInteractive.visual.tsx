import type { ReactElement } from "react";

import type { EqIndicatorId } from "@rtc/client-core";
import type { Candle } from "@rtc/domain";
import {
  type ChartViewport,
  chartVm,
  crosshairVm,
  defaultViewport,
  isAtLiveEdge,
  navigatorVm,
  volumeVm,
} from "@rtc/motion-core";

import { CandleChart } from "#/ui/equities/chart/CandleChart";
import { ChartPlot } from "#/ui/equities/chart/ChartPlot";

/**
 * Golden-only wrapper components for the interactive equities chart's
 * forced, gesture-unreachable states (Task C5: panned/zoomed viewport, a
 * pinned crosshair, the line/area kinds, indicator overlays, and the
 * volume/time-axis pair; Task 10: the backfill-paging chips). `CandleChart`
 * owns its viewport/cursor via `useChartGestures` — an internal hook with
 * no prop seam — so `EquitiesChartPanned`/`Zoomed`/`Crosshair`/
 * `LoadingOlder`/`HistoryStart` mount the extracted, purely presentational
 * `ChartPlot` (the real production DOM tree — see `ChartPlot.tsx`) directly
 * with a LITERAL viewport/cursor/loadingOlder/historyStart computed via the
 * same `@rtc/motion-core` functions `CandleChart` itself calls, instead of
 * driving a real gesture sequence (or a real backfill fetch) with synthetic
 * events (out of scope for the visual tier). `plotProps`/`plotRef` are
 * omitted, yielding a static, gesture-free mount. The other four scenarios
 * (`Line`/`Area`/`Indicators`/`VolumeAxis`) need no such bypass —
 * `kind`/`indicators` are already real `CandleChart` props — so those mount
 * the genuine component at its default (initial, untouched) gesture state:
 * fully deterministic, since no pointer/keyboard event ever fires.
 */

// A one-minute-bucket candle at series index `i`: open climbs by 1 per
// index, close alternates ±1 (direction alternates candle-to-candle), so
// the series is long, deterministic, and hand-verifiable — same formula as
// `@rtc/ui-contract`'s `candleFixture.ts` (`generateCandles`/`candleAt`),
// duplicated here (not imported) because that file lives in ui-contract's
// specs tree (test-only, not a package export) and a visual wrapper must
// stay self-contained per client, same as `EquitiesInstrumentHeader`'s own
// literal quote/candle data above. 300 candles — comfortably past the
// zoomed viewport's end (252) — mirrors the domain's real history depth
// (`CANDLE_HISTORY_TOTAL`).
const CANDLE_COUNT = 300;
const BUCKET_MS = 60_000;
const DEFAULT_VISIBLE = 60;
const CHART_INDICATORS: readonly EqIndicatorId[] = ["sma20", "ema50"];

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

export function EquitiesChartPanned(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <ForcedChart viewport={{ start: 120, end: 180 }} />
    </div>
  );
}

export function EquitiesChartZoomed(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <ForcedChart viewport={{ start: 228, end: 252 }} />
    </div>
  );
}

export function EquitiesChartCrosshair(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <ForcedChart
        viewport={defaultViewport(CANDLE_COUNT, DEFAULT_VISIBLE)}
        cursor={{ xFrac: 0.5, yFrac: 0.4 }}
      />
    </div>
  );
}

// Backfill paging chips (BackfillChips, left-edge overlay of ChartPlot):
// the passive "LOADING OLDER…" chip during an in-flight older-page fetch,
// at the default (live-edge) viewport, and the terminal "START OF HISTORY"
// chip once exhaustion is reached AND the viewport sits hard against index
// 0 — both forced via ForcedChart's loadingOlder/historyStart flags rather
// than a real fetch/exhaustion sequence, same bypass as panned/zoomed/
// crosshair above.
export function EquitiesChartLoadingOlder(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <ForcedChart
        viewport={defaultViewport(CANDLE_COUNT, DEFAULT_VISIBLE)}
        loadingOlder={true}
      />
    </div>
  );
}

export function EquitiesChartHistoryStart(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <ForcedChart viewport={{ start: 0, end: 60 }} historyStart={true} />
    </div>
  );
}

export function EquitiesChartLine(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <CandleChart
        candles={CANDLES}
        liveRate={LIVE_RATE}
        flashOn={false}
        kind="line"
        indicators={[]}
        panes={[]}
        defaultVisible={DEFAULT_VISIBLE}
        loadingOlder={false}
        historyExhausted={false}
        onLoadOlder={() => {}}
      />
    </div>
  );
}

export function EquitiesChartArea(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <CandleChart
        candles={CANDLES}
        liveRate={LIVE_RATE}
        flashOn={false}
        kind="area"
        indicators={[]}
        panes={[]}
        defaultVisible={DEFAULT_VISIBLE}
        loadingOlder={false}
        historyExhausted={false}
        onLoadOlder={() => {}}
      />
    </div>
  );
}

export function EquitiesChartIndicators(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <CandleChart
        candles={CANDLES}
        liveRate={LIVE_RATE}
        flashOn={false}
        kind="candles"
        indicators={CHART_INDICATORS}
        panes={[]}
        defaultVisible={DEFAULT_VISIBLE}
        loadingOlder={false}
        historyExhausted={false}
        onLoadOlder={() => {}}
      />
    </div>
  );
}

export function EquitiesChartVolumeAxis(): ReactElement {
  return (
    <div style={STAGE_STYLE}>
      <CandleChart
        candles={CANDLES}
        liveRate={LIVE_RATE}
        flashOn={false}
        kind="candles"
        indicators={[]}
        panes={[]}
        defaultVisible={DEFAULT_VISIBLE}
        loadingOlder={false}
        historyExhausted={false}
        onLoadOlder={() => {}}
      />
    </div>
  );
}

interface ForcedChartProps {
  readonly viewport: ChartViewport;
  readonly cursor?: { readonly xFrac: number; readonly yFrac: number };
  readonly loadingOlder?: boolean;
  readonly historyStart?: boolean;
}

/** Mounts the real `ChartPlot` (the extracted production DOM tree) around a
 * literal viewport/cursor — see the file doc above. `loadingOlder`/
 * `historyStart` default to `false` so the panned/zoomed/crosshair callers
 * above stay untouched. */
function ForcedChart({
  viewport,
  cursor,
  loadingOlder = false,
  historyStart = false,
}: ForcedChartProps): ReactElement {
  const vm = chartVm(CANDLES, LIVE_RATE, false, {
    viewport,
    kind: "candles",
  });

  const cross = cursor
    ? crosshairVm(cursor.xFrac, cursor.yFrac, CANDLES, viewport, vm.scale)
    : null;
  const atLiveEdge = isAtLiveEdge(viewport, CANDLE_COUNT);

  return (
    <ChartPlot
      vm={vm}
      kind="candles"
      indicatorPaths={[]}
      cross={cross}
      atLiveEdge={atLiveEdge}
      volumeBars={volumeVm(CANDLES, viewport)}
      onBackToLive={() => {}}
      nav={navigatorVm(CANDLES, viewport)}
      loadingOlder={loadingOlder}
      historyStart={historyStart}
    />
  );
}
