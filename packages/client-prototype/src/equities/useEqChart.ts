import { useCallback, useRef, useState } from "react";

import { genCandles } from "#/equities/equitiesData";
import type { Candle, EqSym, Timeframe, WlSort } from "#/equities/types";

const INITIAL_SYM: EqSym = "AAPL";
const INITIAL_TF: Timeframe = "1D";
const WL_ORDER: WlSort[] = ["sym", "chg", "price"];

export interface EqChartApi {
  sel: EqSym;
  openTabs: EqSym[];
  tf: Timeframe;
  wlSort: WlSort;
  series: Candle[];
  selectEq(sym: EqSym): void;
  closeTab(sym: EqSym): void;
  setTf(tf: Timeframe): void;
  cycleWlSort(): void;
}

export interface UseEqChartOptions {
  rng?: () => number;
}

export function useEqChart(opts: UseEqChartOptions = {}): EqChartApi {
  const { rng = Math.random } = opts;
  const rngRef = useRef(rng);

  const [sel, setSel] = useState<EqSym>(INITIAL_SYM);
  const [openTabs, setOpenTabs] = useState<EqSym[]>([INITIAL_SYM]);
  const [tf, setTfState] = useState<Timeframe>(INITIAL_TF);
  const [wlSort, setWlSort] = useState<WlSort>("chg");

  // Seed the initial series via a render-body ref-lazy-init, NOT a useState
  // initializer (StrictMode double-invokes initializers, drawing the RNG
  // twice). The ref persists across the double render, so genCandles runs once.
  const seedRef = useRef<Record<string, Candle[]> | null>(null);

  if (seedRef.current === null) {
    seedRef.current = {
      [INITIAL_SYM]: genCandles(INITIAL_SYM, INITIAL_TF, rngRef.current),
    };
  }

  const [seriesMap, setSeriesMap] = useState<Record<string, Candle[]>>(
    seedRef.current,
  );

  const selRef = useRef(sel);
  selRef.current = sel;
  const tfRef = useRef(tf);
  tfRef.current = tf;
  const openTabsRef = useRef(openTabs);
  openTabsRef.current = openTabs;
  const seriesRef = useRef(seriesMap);
  seriesRef.current = seriesMap;

  const selectEq = useCallback((sym: EqSym) => {
    setSel(sym);
    setOpenTabs((prev) => {
      return prev.includes(sym) ? prev : [...prev, sym];
    });

    if (seriesRef.current[sym] == null) {
      const gen = genCandles(sym, tfRef.current, rngRef.current);
      setSeriesMap((prev) => {
        return { ...prev, [sym]: gen };
      });
    }
  }, []);

  const closeTab = useCallback((sym: EqSym) => {
    const remaining = openTabsRef.current.filter((t) => {
      return t !== sym;
    });

    if (remaining.length === 0) {
      return;
    }

    setOpenTabs(remaining);
    setSel((prev) => {
      return prev === sym ? remaining[remaining.length - 1] : prev;
    });
  }, []);

  const setTf = useCallback((next: Timeframe) => {
    const gen = genCandles(selRef.current, next, rngRef.current);
    setTfState(next);
    setSeriesMap((prev) => {
      return { ...prev, [selRef.current]: gen };
    });
  }, []);

  const cycleWlSort = useCallback(() => {
    setWlSort((prev) => {
      return WL_ORDER[(WL_ORDER.indexOf(prev) + 1) % WL_ORDER.length];
    });
  }, []);

  const series: Candle[] = seriesMap[sel] ?? [];

  return {
    sel,
    openTabs,
    tf,
    wlSort,
    series,
    selectEq,
    closeTab,
    setTf,
    cycleWlSort,
  };
}
