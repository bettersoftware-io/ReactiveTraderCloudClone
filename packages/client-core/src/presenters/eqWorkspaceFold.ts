import type {
  EqChartType,
  EqIndicatorId,
  EqPaneId,
  EqWorkspaceState,
} from "@rtc/core-api";
import type { CandleTimeframe, EquityInstrument } from "@rtc/domain";

/** One input of the equities-workspace fold: the eight intents, plus the
 * one-shot `seed` a late-arriving watchlist supplies. */
export type EqWorkspaceEvent =
  | { readonly kind: "select"; readonly sym: string }
  | { readonly kind: "closeTab"; readonly sym: string }
  | { readonly kind: "setTimeframe"; readonly timeframe: CandleTimeframe }
  | { readonly kind: "setChartType"; readonly chartType: EqChartType }
  | { readonly kind: "toggleIndicator"; readonly id: EqIndicatorId }
  | { readonly kind: "togglePane"; readonly id: EqPaneId }
  | { readonly kind: "toggleYScale" }
  | { readonly kind: "setCompare"; readonly sym: string | null }
  | { readonly kind: "seed"; readonly sym: string };

/** The workspace a session opens with. An empty `initialSymbol` means no
 * tab is open yet (WS-real: the watchlist has not arrived synchronously) —
 * NOT a phantom "" tab. */
export function createEqWorkspaceState(
  initialSymbol: string,
): EqWorkspaceState {
  return {
    sel: initialSymbol,
    openTabs: initialSymbol === "" ? [] : [initialSymbol],
    timeframe: "1D",
    chartType: "candles",
    indicators: [],
    panes: [],
    yScale: "linear",
    compare: null,
  };
}

/** The first symbol of a watchlist, or "" when there is none — what the
 * workspace seeds its selection from, synchronously at composition and,
 * failing that, from the first non-empty list to arrive. */
export function firstWatchlistSymbol(
  list: readonly EquityInstrument[],
): string {
  return list[0]?.symbol ?? "";
}

/** The equities-workspace state transition, shared by every application
 * core. The GUARDED no-ops — `closeTab` of an unknown or the sole tab,
 * `setCompare` of the selected symbol, a `seed` on a populated workspace —
 * return the SAME reference, so a core whose cell drops an `Object.is`-equal
 * write stays silent through them; an idempotent set (`select` of the
 * current selection, `setTimeframe`/`setChartType` with the current value)
 * still builds a new object, as the RxJS machine always did. */
export function reduceEqWorkspace(
  state: EqWorkspaceState,
  event: EqWorkspaceEvent,
): EqWorkspaceState {
  switch (event.kind) {
    case "select":
      return selectSymbol(state, event.sym);
    case "closeTab":
      return closeTab(state, event.sym);
    case "setTimeframe":
      return { ...state, timeframe: event.timeframe };
    case "setChartType":
      return { ...state, chartType: event.chartType };
    case "toggleIndicator":
      return { ...state, indicators: toggled(state.indicators, event.id) };
    case "togglePane":
      return { ...state, panes: toggled(state.panes, event.id) };
    case "toggleYScale":
      return { ...state, yScale: state.yScale === "log" ? "linear" : "log" };
    case "setCompare":
      // Comparing the selected symbol against itself is a no-op, not a clear.
      return event.sym !== null && event.sym === state.sel
        ? state
        : { ...state, compare: event.sym };
    case "seed":
      // Only while nothing is selected: a synchronous initial symbol or an
      // intervening user select() always wins over a late-arriving seed.
      return state.sel !== ""
        ? state
        : { ...state, sel: event.sym, openTabs: [event.sym] };
  }
}

/** Adds the symbol to the open tabs if it is not there, then (re)selects
 * it. Selecting the compared symbol clears the comparison — the primary
 * absorbs it. */
function selectSymbol(state: EqWorkspaceState, sym: string): EqWorkspaceState {
  const openTabs = state.openTabs.includes(sym)
    ? state.openTabs
    : [...state.openTabs, sym];
  const compare = state.compare === sym ? null : state.compare;
  return { ...state, sel: sym, openTabs, compare };
}

/** Never empties the tab strip: closing the sole remaining tab, or a symbol
 * that is not open, is a no-op. Closing the SELECTED tab falls back to the
 * tab that slides into its slot, or the new last tab. */
function closeTab(state: EqWorkspaceState, sym: string): EqWorkspaceState {
  const idx = state.openTabs.indexOf(sym);

  if (idx === -1 || state.openTabs.length === 1) {
    return state;
  }

  const openTabs = [
    ...state.openTabs.slice(0, idx),
    ...state.openTabs.slice(idx + 1),
  ];

  if (state.sel !== sym) {
    return { ...state, openTabs };
  }

  const neighbourIdx = Math.min(idx, openTabs.length - 1);
  return { ...state, sel: openTabs[neighbourIdx], openTabs };
}

function toggled<T>(set: readonly T[], id: T): readonly T[] {
  return set.includes(id)
    ? set.filter((existing) => {
        return existing !== id;
      })
    : [...set, id];
}
