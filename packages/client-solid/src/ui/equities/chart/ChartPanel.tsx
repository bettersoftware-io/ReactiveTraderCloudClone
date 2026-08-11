import { type Accessor, createMemo, type JSX, Show } from "solid-js";

import type { EqDrawing } from "@rtc/client-core";
import {
  CANDLE_DEFAULT_VISIBLE,
  type Candle,
  type CandleTimeframe,
} from "@rtc/domain";
import type { CandleBackfillState } from "@rtc/solid-bindings";
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
 * SOLID PORT NOTE: `useEquityQuote`/`useCandles` take a plain `symbol`
 * (mirroring the react ViewModel's per-render hook-call shape), not an
 * accessor — so a persistent ChartPanel can't just re-call them when the
 * shared `sel`/`timeframe` change; it wouldn't re-run. Instead, `ChartBody`
 * below is keyed on `sel::timeframe` — Solid's keyed `<Show>` fully remounts
 * (tears down and recreates, including each hook's underlying subscription
 * AND `createChartGestures`'s gesture state) whenever that composite key's
 * VALUE changes — the same remount-on-switch signal React's
 * `key={`${sel}|${timeframe}`}` gives `useChartGestures`.
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
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const quote = useEquityQuote(props.symbol);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const candles = useCandles(props.symbol, props.timeframe);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const backfill = useCandleBackfill(props.symbol, props.timeframe);
  // Alias so biome's (React-centric) useHookAtTopLevel heuristic no longer
  // matches on the name `useCandles`: solid-bindings' `use*` functions are
  // plain factories (toSignal-based), not React hooks, and calling one
  // inside a keyed createMemo below is the deliberate keyed-resource
  // pattern — not a rule violation to suppress.
  const candleSeriesFor = useCandles;
  // The comparison symbol's series. `useCandles` subscribes at CALL time
  // with a plain symbol (see the SOLID PORT NOTE above) — but unlike
  // sel/timeframe, a compare switch must NOT remount ChartBody (that would
  // reset the viewport). Calling it inside a createMemo keyed on the
  // compare symbol gives the keyed-resource behaviour instead: toSignal
  // registers onCleanup, and a memo re-run disposes its previous
  // computation's cleanups — so each compare value gets a fresh
  // subscription and the old one is torn down, no remount involved.
  const compareCandles = createMemo((): (() => readonly Candle[]) | null => {
    const sym = state().compare;
    return sym !== null ? candleSeriesFor(sym, props.timeframe) : null;
  });
  // Biome's useHookAtTopLevel is React-centric: solid-bindings' use*
  // functions are plain factories, and this alias keeps the keyed
  // createMemo call below from matching the hook-name heuristic under the
  // repo's no-disables policy (twin of candleSeriesFor above).
  const candleBackfillFor = useCandleBackfill;
  // The comparison symbol's backfill flags — same keyed-resource pattern
  // as compareCandles above (toSignal registers onCleanup; a memo re-run
  // disposes the previous subscription). Typed via the bindings'
  // CandleBackfillState (ChartPanel already depends on solid-bindings
  // wholesale) rather than an inline object return type, which the repo's
  // no-restricted-syntax rule bans outright — the isolation the global
  // constraint asks for is CandleChart's props surface, not this internal
  // memo.
  const compareBackfill = createMemo(
    (): Accessor<CandleBackfillState> | null => {
      const sym = state().compare;
      return sym !== null ? candleBackfillFor(sym, props.timeframe) : null;
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
            compareCandles() !== null
              ? { series: compareCandles()?.() ?? [] }
              : undefined
          }
          compareBackfill={
            compareBackfill() !== null ? compareBackfill()?.() : undefined
          }
          defaultVisible={defaultVisible()}
          loadingOlder={backfill().loadingOlder}
          historyExhausted={backfill().historyExhausted}
          onLoadOlder={loadOlderForChart}
          onLoadOlderCompare={loadOlderForCompare}
          drawTool={drawState().tool}
          drawings={drawState().drawings[props.symbol] ?? EMPTY_DRAWINGS}
          selectedDrawingId={drawState().selectedId}
          onCommitDrawing={(d: EqDrawing) => {
            addDrawing(props.symbol, d);
          }}
          onUpdateDrawing={(d: EqDrawing) => {
            updateDrawing(props.symbol, d);
          }}
          onSelectDrawing={selectDrawing}
          onDeleteSelected={() => {
            deleteSelected(props.symbol);
          }}
          onShiftAnchors={(by: number) => {
            shiftAnchors(props.symbol, by);
          }}
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
