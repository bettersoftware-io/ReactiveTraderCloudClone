import { type StateObservable, state } from "@rx-state/core";
import { EMPTY, merge, type Observable, Subject } from "rxjs";
import { map, scan, take } from "rxjs/operators";

import type { CandleTimeframe } from "@rtc/domain";

import type { Machine } from "./machine";

// Declared locally rather than imported from @rtc/motion-core — client-core
// must not depend on motion-core (see global constraints). These unify
// structurally with motion-core's ChartKind/IndicatorId equivalents.
export type EqChartType = "candles" | "line" | "area";
export type EqIndicatorId = "sma20" | "ema50";
export type EqPaneId = "rsi" | "macd";
export type EqYScale = "linear" | "log";

export interface EqWorkspaceState {
  readonly sel: string;
  readonly openTabs: readonly string[];
  readonly timeframe: CandleTimeframe;
  readonly chartType: EqChartType;
  readonly indicators: readonly EqIndicatorId[];
  readonly panes: readonly EqPaneId[];
  readonly yScale: EqYScale;
}

export interface EqWorkspaceIntents {
  select(sym: string): void;
  closeTab(sym: string): void;
  setTimeframe(tf: CandleTimeframe): void;
  setChartType(kind: EqChartType): void;
  toggleIndicator(id: EqIndicatorId): void;
  togglePane(id: EqPaneId): void;
  toggleYScale(): void;
}

export interface EqWorkspaceDeps {
  /** Symbol the workspace opens with — becomes the sole open tab and the
   * selection. Composition supplies the first watchlist symbol (falls back
   * to "" if none is known synchronously yet). */
  readonly initialSymbol: string;
  /** Optional async recovery source, used ONLY when `initialSymbol` arrives
   * "" (WS-real: the watchlist hasn't loaded synchronously at composition
   * time, unlike the simulator's synchronous `of(WATCHLIST)`). Emits the
   * resolved seed symbol once, when it first becomes known; the machine
   * takes exactly one emission and seeds `sel`/`openTabs` from it, but ONLY
   * if nothing has selected a symbol in the meantime (a user click or the
   * synchronous peek always wins over a late-arriving seed — see
   * `seedPatch$` below). Omitted by tests that don't care about the async
   * path (defaults to a source that never emits). */
  readonly seed$?: Observable<string>;
}

type Patch = (s: EqWorkspaceState) => EqWorkspaceState;

/**
 * Cross-panel equities workspace state: the selected symbol, the open
 * instrument tabs, and the shared chart timeframe. This is a
 * composition-root SINGLETON — unlike OrderTicketMachine/TileExecutionMachine
 * (one fresh instance per component mount via `useMachine`), the chart,
 * instrument-tabs, and watchlist panels are independent engine cells that
 * cannot share React state, so this machine is the one shared source of truth
 * they all read/write through `useEqWorkspace()` (mirrors IncidentMachine's
 * shared-singleton wiring in composition.ts).
 *
 * `state$` is kept warm from construction (an internal `.subscribe()`, torn
 * down in `dispose()`), so it always carries a synchronous current value —
 * the PR #118 refCount lesson: a cold `shareReplay`/`state()` stream with no
 * live subscriber can drop its buffer between one panel unmounting and the
 * next panel mounting, which would otherwise glitch the shared selection.
 */
export function createEqWorkspaceMachine(
  deps: EqWorkspaceDeps,
): Machine<EqWorkspaceState, EqWorkspaceIntents> {
  const select$ = new Subject<string>();
  const closeTab$ = new Subject<string>();
  const setTimeframe$ = new Subject<CandleTimeframe>();
  const setChartType$ = new Subject<EqChartType>();
  const toggleIndicator$ = new Subject<EqIndicatorId>();
  const togglePane$ = new Subject<EqPaneId>();
  const toggleYScale$ = new Subject<void>();

  // An empty initialSymbol means no tab is open yet (WS-real, watchlist not
  // arrived synchronously) — NOT a phantom "" tab. InstrumentTabs then simply
  // renders nothing until seedPatch$ (or a user select()) populates openTabs.
  const initial: EqWorkspaceState = {
    sel: deps.initialSymbol,
    openTabs: deps.initialSymbol === "" ? [] : [deps.initialSymbol],
    timeframe: "1D",
    chartType: "candles",
    indicators: [],
    panes: [],
    yScale: "linear",
  };

  // select: adds the symbol to openTabs if it isn't already there, then
  // (re)selects it — the prototype's "click watchlist row" behaviour.
  const selectPatch$ = select$.pipe(
    map((sym): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        const openTabs = s.openTabs.includes(sym)
          ? s.openTabs
          : [...s.openTabs, sym];
        return { ...s, sel: sym, openTabs };
      };
    }),
  );

  // closeTab: never empties the tab strip — closing the sole remaining tab,
  // or a symbol that isn't open, is a no-op. Closing the SELECTED tab falls
  // back to its nearest remaining neighbour: the tab that slides into its
  // vacated slot, or the new last tab if it was the rightmost one.
  const closeTabPatch$ = closeTab$.pipe(
    map((sym): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        const idx = s.openTabs.indexOf(sym);

        if (idx === -1) {
          return s;
        }

        if (s.openTabs.length === 1) {
          return s;
        }

        const openTabs = [
          ...s.openTabs.slice(0, idx),
          ...s.openTabs.slice(idx + 1),
        ];

        if (s.sel !== sym) {
          return { ...s, openTabs };
        }

        const neighbourIdx = Math.min(idx, openTabs.length - 1);
        return { ...s, sel: openTabs[neighbourIdx], openTabs };
      };
    }),
  );

  const setTimeframePatch$ = setTimeframe$.pipe(
    map((timeframe): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        return { ...s, timeframe };
      };
    }),
  );

  const setChartTypePatch$ = setChartType$.pipe(
    map((chartType): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        return { ...s, chartType };
      };
    }),
  );

  // toggleIndicator: adds the indicator to the shared workspace's active set
  // when absent, removes it when already present.
  const toggleIndicatorPatch$ = toggleIndicator$.pipe(
    map((id): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        const indicators = s.indicators.includes(id)
          ? s.indicators.filter((existing) => {
              return existing !== id;
            })
          : [...s.indicators, id];
        return { ...s, indicators };
      };
    }),
  );

  // togglePane: adds the pane to the shared workspace's active set when
  // absent, removes it when already present — independent of `indicators`
  // (a separate active set with its own subject/patch pair, same shape).
  const togglePanePatch$ = togglePane$.pipe(
    map((id): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        const panes = s.panes.includes(id)
          ? s.panes.filter((existing) => {
              return existing !== id;
            })
          : [...s.panes, id];
        return { ...s, panes };
      };
    }),
  );

  // toggleYScale: flips the price axis between linear and log — a binary
  // toggle (no payload), unlike the id-keyed indicator/pane sets.
  const toggleYScalePatch$ = toggleYScale$.pipe(
    map((): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        return { ...s, yScale: s.yScale === "log" ? "linear" : "log" };
      };
    }),
  );

  // Recovery patch: takes exactly one emission from seed$ (or never emits,
  // when seed$ is omitted) and seeds sel/openTabs — but only while sel is
  // still "", so a synchronous initialSymbol or an intervening user select()
  // always wins. This is the ONLY path that can turn an empty workspace into
  // a seeded one when the watchlist arrives asynchronously (WS-real).
  const seedPatch$ = (deps.seed$ ?? EMPTY).pipe(
    take(1),
    map((sym): Patch => {
      return (s: EqWorkspaceState): EqWorkspaceState => {
        if (s.sel !== "") {
          return s;
        }

        return { ...s, sel: sym, openTabs: [sym] };
      };
    }),
  );

  const stream$ = merge(
    selectPatch$,
    closeTabPatch$,
    setTimeframePatch$,
    setChartTypePatch$,
    toggleIndicatorPatch$,
    togglePanePatch$,
    toggleYScalePatch$,
    seedPatch$,
  ).pipe(
    scan((s, patch) => {
      return patch(s);
    }, initial),
  );

  const state$: StateObservable<EqWorkspaceState> = state(stream$, initial);

  // Keep state$ warm so it carries its default before any panel's
  // useEqWorkspace first renders, and survives every individual panel
  // unmounting/remounting (see the class doc comment above).
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      select: (sym: string): void => {
        select$.next(sym);
      },
      closeTab: (sym: string): void => {
        closeTab$.next(sym);
      },
      setTimeframe: (tf: CandleTimeframe): void => {
        setTimeframe$.next(tf);
      },
      setChartType: (kind: EqChartType): void => {
        setChartType$.next(kind);
      },
      toggleIndicator: (id: EqIndicatorId): void => {
        toggleIndicator$.next(id);
      },
      togglePane: (id: EqPaneId): void => {
        togglePane$.next(id);
      },
      toggleYScale: (): void => {
        toggleYScale$.next();
      },
    },
    dispose: () => {
      select$.complete();
      closeTab$.complete();
      setTimeframe$.complete();
      setChartType$.complete();
      toggleIndicator$.complete();
      togglePane$.complete();
      toggleYScale$.complete();
      warm.unsubscribe();
    },
  };
}
