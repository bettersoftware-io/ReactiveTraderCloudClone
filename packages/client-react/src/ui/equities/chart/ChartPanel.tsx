import type { ReactElement } from "react";

import type { EqDrawing } from "@rtc/client-core";
import { CANDLE_DEFAULT_VISIBLE } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

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
 */
export function ChartPanel(): ReactElement {
  const {
    useEqWorkspace,
    useEquityQuote,
    useCandles,
    useCandleBackfill,
    useWatchlist,
    loadOlderCandles,
    useEqDrawings,
  } = useViewModel();
  const { state } = useEqWorkspace();
  const { sel, timeframe, chartType, indicators, panes, yScale } = state;
  const {
    state: drawState,
    addDrawing,
    selectDrawing,
    deleteSelected,
    shiftAnchors,
    updateDrawing,
  } = useEqDrawings();
  const quote = useEquityQuote(sel);
  const candles = useCandles(sel, timeframe);
  const backfill = useCandleBackfill(sel, timeframe);
  const instruments = useWatchlist();
  const instrument = instruments.find((i) => {
    return i.symbol === sel;
  });
  // Derived once here (no timers) and shared by the header's flash colour
  // and the candle plot's last-bar glow — mirrors the prototype's single
  // fl/flashOn computed in EquitiesScreen and threaded to both.
  const { flashOn, dir } = useTickFlash(quote?.last ?? null);

  if (!sel) {
    return <div className={styles.empty}>SELECT AN INSTRUMENT</div>;
  }

  const defaultVisible = CANDLE_DEFAULT_VISIBLE[timeframe];

  function loadOlderForSelected(): void {
    loadOlderCandles(sel, timeframe);
  }

  return (
    <div className={styles.body}>
      <div className={styles.chartArea}>
        <InstrumentHeader
          symbol={sel}
          instrumentName={instrument?.name}
          exchange={instrument?.exchange}
          quote={quote}
          candles={candles}
          flashOn={flashOn}
          flashDir={dir}
        />
        <CandleChart
          // Remounts the gesture state (and so resets the viewport) on
          // every symbol/timeframe switch — useChartGestures has no other
          // way to know "the series means something different now" (a
          // symbol swap keeps a similar seriesLen; a timeframe swap can
          // even keep it identical), so a fresh mount is the reset signal.
          key={`${sel}|${timeframe}`}
          candles={candles}
          liveRate={quote?.last ?? 0}
          flashOn={flashOn}
          kind={chartType}
          indicators={indicators}
          panes={panes}
          yScale={yScale}
          defaultVisible={defaultVisible}
          loadingOlder={backfill.loadingOlder}
          historyExhausted={backfill.historyExhausted}
          onLoadOlder={loadOlderForSelected}
          drawTool={drawState.tool}
          drawings={drawState.drawings[sel] ?? EMPTY_DRAWINGS}
          selectedDrawingId={drawState.selectedId}
          onCommitDrawing={(d: EqDrawing) => {
            addDrawing(sel, d);
          }}
          onUpdateDrawing={(d: EqDrawing) => {
            updateDrawing(sel, d);
          }}
          onSelectDrawing={selectDrawing}
          onDeleteSelected={() => {
            deleteSelected(sel);
          }}
          onShiftAnchors={(by: number) => {
            shiftAnchors(sel, by);
          }}
        />
      </div>
    </div>
  );
}

// Stable empty-array identity so a symbol with no drawings yet doesn't hand
// CandleChart a fresh `[]` every render (mirrors CandleChart's own
// EMPTY_DRAWINGS default — this one covers the "selected symbol not yet a
// key in state.drawings" case).
const EMPTY_DRAWINGS: readonly EqDrawing[] = [];
