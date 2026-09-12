import { createMemo, type JSX, Show } from "solid-js";

import type { EqDrawing } from "@rtc/client-core";
import { CANDLE_DEFAULT_VISIBLE, type CandleTimeframe } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { CandleChart } from "./CandleChart";
import { InstrumentHeader } from "./InstrumentHeader";
import { useTickFlash } from "./useTickFlash";

import styles from "./ChartPanel.module.css";

/**
 * The chart panel's body: the live instrument header over the interactive
 * candle plot for the workspace's selected symbol. The control row
 * (instrument tabs + chart-type/indicator/timeframe pills) is hoisted to
 * EqChartHead, the panel's headControls — mirroring the prototype's
 * ChartPanelControls split. A pure data/join component: all chart geometry
 * and gesture state live in CandleChart.
 *
 * SOLID PORT NOTE: `ChartBody` below is keyed on `sel::timeframe`, so Solid's
 * keyed `<Show>` fully remounts it whenever that composite key's VALUE
 * changes. What that remount is FOR is `createChartGestures`'s gesture state:
 * a switch must reset the viewport, and the gesture layer has no other way to
 * know "the series means something different now" (a symbol swap keeps a
 * similar seriesLen; a timeframe swap can keep it identical) — the same
 * signal react gets from `key={`${sel}|${timeframe}`}`, which it puts on
 * `CandleChart` alone. It is NOT what keeps the data hooks correct any more:
 * `useEquityQuote`/`useCandles`/`useCandleBackfill` take accessor keys and
 * re-subscribe on their own, so narrowing this remount to `CandleChart` (as
 * react does) is now a viable follow-up — one the goldens, not the type
 * checker, would have to witness.
 */
export function ChartPanel(): JSX.Element {
  const { useEqWorkspace } = useViewModel();
  const { state } = useEqWorkspace();

  const bodyKey = createMemo((): string | false => {
    const s = state();
    return s.sel ? `${s.sel}::${s.timeframe}` : false;
  });

  return (
    <Show
      when={bodyKey()}
      keyed
      fallback={<div class={styles.empty}>SELECT AN INSTRUMENT</div>}
    >
      {(_key: string): JSX.Element => {
        return <ChartBody symbol={state().sel} timeframe={state().timeframe} />;
      }}
    </Show>
  );
}

interface ChartBodyProps {
  symbol: string;
  timeframe: CandleTimeframe;
}

function ChartBody(props: ChartBodyProps): JSX.Element {
  const {
    useEqWorkspace,
    useEquityQuote,
    useCandles,
    useCandleBackfill,
    useWatchlist,
    loadOlderCandles,
    useEqDrawings,
    useChartSubstrate,
  } = useViewModel();
  const { state } = useEqWorkspace();
  const { substrate } = useChartSubstrate();
  const {
    state: drawState,
    addDrawing,
    selectDrawing,
    deleteSelected,
    shiftAnchors,
    updateDrawing,
  } = useEqDrawings();

  const quote = useEquityQuote(() => {
    return props.symbol;
  });

  const candles = useCandles(
    () => {
      return props.symbol;
    },
    () => {
      return props.timeframe;
    },
  );

  const backfill = useCandleBackfill(
    () => {
      return props.symbol;
    },
    () => {
      return props.timeframe;
    },
  );

  // The comparison series and its backfill flags. Both keys are accessors,
  // so a compare switch re-subscribes in place — unlike sel/timeframe it
  // must NOT remount ChartBody, which would reset the viewport. `?? ""`
  // parks the subscription on the empty symbol while no comparison is set
  // and the JSX below hands CandleChart `undefined` then; verbatim the
  // react twin's `useCandles(compare ?? "", timeframe)`.
  const compareCandles = useCandles(
    () => {
      return state().compare ?? "";
    },
    () => {
      return props.timeframe;
    },
  );

  const compareBackfill = useCandleBackfill(
    () => {
      return state().compare ?? "";
    },
    () => {
      return props.timeframe;
    },
  );
  const instruments = useWatchlist();
  const instrument = createMemo(() => {
    return instruments().find((i) => {
      return i.symbol === props.symbol;
    });
  });

  // Derived once here (no timers) and shared by the header's flash colour
  // and the candle plot's last-bar glow — mirrors the prototype's single
  // fl/flashOn computed in EquitiesScreen and threaded to both.
  const flash = useTickFlash(() => {
    return quote()?.last ?? null;
  });

  const defaultVisible = createMemo(() => {
    return CANDLE_DEFAULT_VISIBLE[props.timeframe];
  });

  // Pages every series the chart is rendering: the primary always, plus
  // the comparison when one is set — ineligible series are safe no-ops in
  // CandleSeriesPresenter.loadOlder. Reads the compare symbol at CALL time
  // (event-handler scope), so no reactive wrapper is needed.
  function loadOlderForChart(): void {
    loadOlderCandles(props.symbol, props.timeframe);
    const sym = state().compare;

    if (sym !== null) {
      loadOlderCandles(sym, props.timeframe);
    }
  }

  // Pages ONLY the comparison — the catch-up gate's intent (a compare
  // activated or swapped after the primary already backfilled must page
  // itself level with the visible window WITHOUT the primary fetching
  // pages nobody scrolled to). Reads the compare symbol at CALL time, like
  // loadOlderForChart above.
  function loadOlderForCompare(): void {
    const sym = state().compare;

    if (sym !== null) {
      loadOlderCandles(sym, props.timeframe);
    }
  }

  function commitDrawing(d: EqDrawing): void {
    addDrawing(props.symbol, d);
  }

  function updateDrawingOnSelectedSymbol(d: EqDrawing): void {
    updateDrawing(props.symbol, d);
  }

  function deleteSelectedDrawing(): void {
    deleteSelected(props.symbol);
  }

  function shiftAnchorsForSelectedSymbol(by: number): void {
    shiftAnchors(props.symbol, by);
  }

  return (
    <div class={styles.body}>
      <div class={styles.chartArea}>
        <InstrumentHeader
          symbol={props.symbol}
          instrumentName={instrument()?.name}
          exchange={instrument()?.exchange}
          quote={quote()}
          candles={candles()}
          flashOn={flash().flashOn}
          flashDir={flash().dir}
        />
        <CandleChart
          candles={candles()}
          liveRate={quote()?.last ?? 0}
          flashOn={flash().flashOn}
          kind={state().chartType}
          indicators={state().indicators}
          panes={state().panes}
          yScale={state().yScale}
          compare={
            state().compare !== null ? { series: compareCandles() } : undefined
          }
          compareBackfill={
            state().compare !== null ? compareBackfill() : undefined
          }
          defaultVisible={defaultVisible()}
          loadingOlder={backfill().loadingOlder}
          historyExhausted={backfill().historyExhausted}
          onLoadOlder={loadOlderForChart}
          onLoadOlderCompare={loadOlderForCompare}
          drawTool={drawState().tool}
          drawings={drawState().drawings[props.symbol] ?? EMPTY_DRAWINGS}
          selectedDrawingId={drawState().selectedId}
          onCommitDrawing={commitDrawing}
          onUpdateDrawing={updateDrawingOnSelectedSymbol}
          onSelectDrawing={selectDrawing}
          onDeleteSelected={deleteSelectedDrawing}
          onShiftAnchors={shiftAnchorsForSelectedSymbol}
          substrate={substrate()}
        />
      </div>
    </div>
  );
}

// Stable empty-array identity so a symbol with no drawings yet doesn't hand
// CandleChart a fresh `[]` every render (mirrors CandleChart's own
// EMPTY_DRAWINGS default — this one covers the "selected symbol not yet a
// key in drawState().drawings" case).
const EMPTY_DRAWINGS: readonly EqDrawing[] = [];
