import { type StateObservable, state } from "@rx-state/core";
import { EMPTY, merge, type Observable, Subject } from "rxjs";
import { map, scan, take } from "rxjs/operators";

import type {
  EqChartType,
  EqIndicatorId,
  EqPaneId,
  EqWorkspaceIntents,
  EqWorkspaceState,
  EqYScale,
} from "@rtc/core-api";
import type { CandleTimeframe } from "@rtc/domain";

import {
  createEqWorkspaceState,
  type EqWorkspaceEvent,
  reduceEqWorkspace,
} from "./eqWorkspaceFold";
import type { Machine } from "./machine";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type {
  EqChartType,
  EqIndicatorId,
  EqPaneId,
  EqWorkspaceIntents,
  EqWorkspaceState,
  EqYScale,
};

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
  const event$ = new Subject<EqWorkspaceEvent>();
  const initial = createEqWorkspaceState(deps.initialSymbol);

  // Recovery: exactly one emission from seed$ (or none, when it is omitted).
  // The fold applies it only while `sel` is still "" — the ONLY path that
  // turns an empty workspace into a seeded one when the watchlist arrives
  // asynchronously (WS-real).
  const seedEvent$ = (deps.seed$ ?? EMPTY).pipe(
    take(1),
    map((sym): EqWorkspaceEvent => {
      return { kind: "seed", sym };
    }),
  );

  const stream$ = merge(event$, seedEvent$).pipe(
    scan(reduceEqWorkspace, initial),
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
        event$.next({ kind: "select", sym });
      },
      closeTab: (sym: string): void => {
        event$.next({ kind: "closeTab", sym });
      },
      setTimeframe: (tf: CandleTimeframe): void => {
        event$.next({ kind: "setTimeframe", timeframe: tf });
      },
      setChartType: (kind: EqChartType): void => {
        event$.next({ kind: "setChartType", chartType: kind });
      },
      toggleIndicator: (id: EqIndicatorId): void => {
        event$.next({ kind: "toggleIndicator", id });
      },
      togglePane: (id: EqPaneId): void => {
        event$.next({ kind: "togglePane", id });
      },
      toggleYScale: (): void => {
        event$.next({ kind: "toggleYScale" });
      },
      setCompare: (sym: string | null): void => {
        event$.next({ kind: "setCompare", sym });
      },
    },
    dispose: () => {
      event$.complete();
      warm.unsubscribe();
    },
  };
}
