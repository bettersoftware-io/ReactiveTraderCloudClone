import type { ReactElement } from "react";

import { chartVm } from "@rtc/motion-core";
import { useViewModel } from "@rtc/react-bindings";

import { CandleChart } from "./CandleChart";
import { InstrumentHeader } from "./InstrumentHeader";
import { useTickFlash } from "./useTickFlash";

import styles from "./ChartPanel.module.css";

/**
 * The chart panel's body: the live instrument header over the candlestick
 * plot for the workspace's selected symbol. The control row (instrument
 * tabs + timeframe pills) is hoisted to EqChartHead, the panel's
 * headControls — mirroring the prototype's ChartPanelControls split.
 */
export function ChartPanel(): ReactElement {
  const { useEqWorkspace, useEquityQuote, useCandles, useWatchlist } =
    useViewModel();
  const { state } = useEqWorkspace();
  const { sel, timeframe } = state;
  const quote = useEquityQuote(sel);
  const candles = useCandles(sel, timeframe);
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

  const vm = chartVm(candles, quote?.last ?? 0, flashOn);

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
        <CandleChart vm={vm} />
      </div>
    </div>
  );
}
