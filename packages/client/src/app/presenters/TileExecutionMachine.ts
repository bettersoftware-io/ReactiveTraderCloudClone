import {
  Subject,
  merge,
  of,
  timer,
  concat,
  type Observable,
} from "rxjs";
import {
  catchError,
  map,
  switchMap,
  scan,
  distinctUntilChanged,
  takeUntil,
} from "rxjs/operators";
import { state, type StateObservable } from "@react-rxjs/core";
import {
  type CurrencyPair,
  type Price,
  type Direction,
  type Trade,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  ExecutionStatus,
  TOO_LONG_THRESHOLD_MS,
  EXECUTION_TIMEOUT_MS,
  CONFIRMATION_DISMISS_MS,
} from "@rtc/domain";
import type { Machine } from "../../ui/hooks/machine";

/** The execution lifecycle of a single tile, relocated out of the old
 * useTileState + useExecuteTrade React hooks. The overlay reads this state. */
export type TileExecutionState =
  | { status: "ready" }
  | { status: "started" }
  | { status: "tooLong" }
  | { status: "finished"; executionStatus: ExecutionStatus; trade?: Trade }
  | { status: "timeout" };

export interface TileExecutionDeps {
  /** The execute command (TradeExecutionPresenter.execute), injected so timing
   * is controllable in tests. */
  execute: (input: ExecuteTradeInput) => Observable<ExecuteTradeResult>;
}

export interface TileExecutionIntents {
  /** Mirrors the args Tile.tsx passes today: direction, the (possibly
   * synthetic RFQ) price, and the resolved notional. */
  execute: (direction: Direction, price: Price, notional: number) => void;
  dismiss: () => void;
}

const READY: TileExecutionState = { status: "ready" };

/** True for the two states from which no further escalation is allowed. */
function isTerminal(s: TileExecutionState): boolean {
  return s.status === "finished" || s.status === "timeout";
}

export function createTileExecutionMachine(
  pair: CurrencyPair,
  deps: TileExecutionDeps,
): Machine<TileExecutionState, TileExecutionIntents> {
  const execute$ = new Subject<{
    direction: Direction;
    price: Price;
    notional: number;
  }>();
  const dismiss$ = new Subject<void>();

  // One execution run: started → (tooLong | result | timeout), collapsed so the
  // first terminal (finished | timeout) wins and later non-terminals (a late
  // result, or a tooLong after a terminal) are dropped. Then the confirmation
  // auto-dismisses after CONFIRMATION_DISMISS_MS.
  const runs$ = execute$.pipe(
    switchMap(({ direction, price, notional }) => {
      const input: ExecuteTradeInput = { pair, direction, price, notional };

      const result$: Observable<TileExecutionState> = deps.execute(input).pipe(
        map(
          (r): TileExecutionState => ({
            status: "finished",
            executionStatus: r.status,
            trade: r.trade,
          }),
        ),
        catchError(() =>
          of<TileExecutionState>({
            status: "finished",
            executionStatus: ExecutionStatus.Timeout,
          }),
        ),
      );

      const tooLong$: Observable<TileExecutionState> = timer(TOO_LONG_THRESHOLD_MS).pipe(
        map((): TileExecutionState => ({ status: "tooLong" })),
      );

      const timeout$: Observable<TileExecutionState> = timer(EXECUTION_TIMEOUT_MS).pipe(
        map((): TileExecutionState => ({ status: "timeout" })),
      );

      // started first, then the three racing escalations, collapsed.
      const lifecycle$ = concat(
        of<TileExecutionState>({ status: "started" }),
        merge(result$, tooLong$, timeout$).pipe(
          scan((acc: TileExecutionState, next: TileExecutionState) => {
            // Once terminal, ignore everything that follows (late result, or a
            // tooLong that fires after the run already settled).
            if (isTerminal(acc)) return acc;
            return next;
          }, { status: "started" } as TileExecutionState),
          distinctUntilChanged(),
        ),
      );

      // Append the auto-dismiss timer once a terminal state is reached.
      // takeUntil(dismiss$) tears the whole run (and its timers) down the moment
      // the user dismisses — mirroring the old hook's clearTimers() on dismiss().
      return lifecycle$.pipe(
        switchMap((s) =>
          isTerminal(s)
            ? concat(of(s), timer(CONFIRMATION_DISMISS_MS).pipe(map(() => READY)))
            : of(s),
        ),
        takeUntil(dismiss$),
      );
    }),
  );

  const stream$ = merge(
    runs$,
    dismiss$.pipe(map(() => READY)),
  );

  const state$: StateObservable<TileExecutionState> = state(stream$, READY);

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      execute: (direction, price, notional) =>
        execute$.next({ direction, price, notional }),
      dismiss: () => dismiss$.next(),
    },
    dispose: () => {
      // Complete the source Subjects first so the merged stream — and the
      // react-rxjs state$ derived from it — completes, then release the warm
      // subscription that was keeping state$ alive.
      execute$.complete();
      dismiss$.complete();
      warm.unsubscribe();
    },
  };
}
