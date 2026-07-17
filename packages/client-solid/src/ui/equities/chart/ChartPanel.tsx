import { createMemo, type JSX, Show } from "solid-js";

import type { CandleTimeframe } from "@rtc/domain";
import { type ChartVm, chartVm } from "@rtc/motion-core";
import { useViewModel } from "@rtc/solid-bindings";

import { CandleChart } from "./CandleChart";
import { InstrumentHeader } from "./InstrumentHeader";
import { useTickFlash } from "./useTickFlash";

import styles from "./ChartPanel.module.css";

/**
 * The chart panel's body: the live instrument header over the candlestick
 * plot for the workspace's selected symbol. The control row (instrument
 * tabs + timeframe pills) is hoisted to EqChartHead, the panel's
 * headControls — mirroring the prototype's ChartPanelControls split.
 *
 * SOLID PORT NOTE: `useEquityQuote`/`useCandles` take a plain `symbol`
 * (mirroring the react ViewModel's per-render hook-call shape), not an
 * accessor — so a persistent ChartPanel can't just re-call them when the
 * shared `sel`/`timeframe` change; it wouldn't re-run. Instead, `ChartBody`
 * below is keyed on `sel::timeframe` — Solid's keyed `<Show>` fully remounts
 * (tears down and recreates, including each hook's underlying subscription)
 * whenever that composite key's VALUE changes, the Solid analogue of React
 * re-invoking the whole component function with fresh hook args.
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
  const { useEquityQuote, useCandles, useWatchlist } = useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const quote = useEquityQuote(props.symbol);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const candles = useCandles(props.symbol, props.timeframe);
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

  const vm = createMemo((): ChartVm => {
    return chartVm(candles(), quote()?.last ?? 0, flash().flashOn);
  });

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
        <CandleChart vm={vm()} />
      </div>
    </div>
  );
}
