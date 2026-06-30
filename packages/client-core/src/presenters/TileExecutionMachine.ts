import { type StateObservable, state } from "@rx-state/core";
import { concat, merge, type Observable, of, Subject, timer } from "rxjs";
import {
  catchError,
  distinctUntilChanged,
  map,
  scan,
  switchMap,
  takeUntil,
} from "rxjs/operators";

import {
  CONFIRMATION_DISMISS_MS,
  type CurrencyPair,
  type Direction,
  EXECUTION_TIMEOUT_MS,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  ExecutionStatus,
  type Price,
  TOO_LONG_THRESHOLD_MS,
  type Trade,
} from "@rtc/domain";

import type { Machine } from "./machine";

interface ExecuteCommand {
  direction: Direction;
  price: Price;
  notional: number;
}

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
  const execute$ = new Subject<ExecuteCommand>();
  const dismiss$ = new Subject<void>();

  // One execution run: started → (tooLong | result | timeout), collapsed so the
  // first terminal (finished | timeout) wins and later non-terminals (a late
  // result, or a tooLong after a terminal) are dropped. Then the confirmation
  // auto-dismisses after CONFIRMATION_DISMISS_MS.
  const runs$ = execute$.pipe(
    switchMap(({ direction, price, notional }) => {
      const input: ExecuteTradeInput = { pair, direction, price, notional };

      const result$: Observable<TileExecutionState> = deps.execute(input).pipe(
        map((r): TileExecutionState => {
          return {
            status: "finished",
            executionStatus: r.status,
            trade: r.trade,
          };
        }),
        catchError(() => {
          return of<TileExecutionState>({
            status: "finished",
            executionStatus: ExecutionStatus.Timeout,
          });
        }),
      );

      const tooLong$: Observable<TileExecutionState> = timer(
        TOO_LONG_THRESHOLD_MS,
      ).pipe(
        map((): TileExecutionState => {
          return { status: "tooLong" };
        }),
      );

      const timeout$: Observable<TileExecutionState> = timer(
        EXECUTION_TIMEOUT_MS,
      ).pipe(
        map((): TileExecutionState => {
          return { status: "timeout" };
        }),
      );

      // started first, then the three racing escalations, collapsed.
      const lifecycle$ = concat(
        of<TileExecutionState>({ status: "started" }),
        merge(result$, tooLong$, timeout$).pipe(
          scan(
            (acc: TileExecutionState, next: TileExecutionState) => {
              // Once terminal, ignore everything that follows (late result, or a
              // tooLong that fires after the run already settled).
              if (isTerminal(acc)) return acc;
              return next;
            },
            { status: "started" } as TileExecutionState,
          ),
          distinctUntilChanged(),
        ),
      );

      // Append the auto-dismiss timer once a terminal state is reached.
      // takeUntil(dismiss$) tears the whole run (and its timers) down the moment
      // the user dismisses — mirroring the old hook's clearTimers() on dismiss().
      return lifecycle$.pipe(
        switchMap((s) => {
          return isTerminal(s)
            ? concat(
                of(s),
                timer(CONFIRMATION_DISMISS_MS).pipe(
                  map(() => {
                    return READY;
                  }),
                ),
              )
            : of(s);
        }),
        takeUntil(dismiss$),
      );
    }),
  );

  const stream$ = merge(
    runs$,
    dismiss$.pipe(
      map(() => {
        return READY;
      }),
    ),
  );

  const state$: StateObservable<TileExecutionState> = state(stream$, READY);

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      execute: (direction: Direction, price: Price, notional: number): void => {
        execute$.next({ direction, price, notional });
      },
      dismiss: () => {
        return dismiss$.next();
      },
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
