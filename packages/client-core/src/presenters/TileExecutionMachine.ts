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

import type { TileExecutionIntents, TileExecutionState } from "@rtc/core-api";
import type { Machine } from "@rtc/core-logic";
import {
  finishedTileExecution,
  isTerminalTileExecution,
  READY_TILE_EXECUTION,
  STARTED_TILE_EXECUTION,
  TIMED_OUT_TILE_EXECUTION,
  TIMEOUT_TILE_EXECUTION,
  TOO_LONG_TILE_EXECUTION,
} from "@rtc/core-logic";
import {
  CONFIRMATION_DISMISS_MS,
  type CurrencyPair,
  type Direction,
  EXECUTION_TIMEOUT_MS,
  type ExecuteTradeInput,
  type ExecuteTradeResult,
  type Price,
  TOO_LONG_THRESHOLD_MS,
} from "@rtc/domain";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { TileExecutionIntents, TileExecutionState };

export interface TileExecutionDeps {
  /** The execute command (TradeExecutionPresenter.execute), injected so timing
   * is controllable in tests. */
  execute: (input: ExecuteTradeInput) => Observable<ExecuteTradeResult>;
}

interface ExecuteCommand {
  direction: Direction;
  price: Price;
  notional: number;
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
          return finishedTileExecution(r);
        }),
        catchError(() => {
          return of<TileExecutionState>(TIMED_OUT_TILE_EXECUTION);
        }),
      );

      const tooLong$: Observable<TileExecutionState> = timer(
        TOO_LONG_THRESHOLD_MS,
      ).pipe(
        map((): TileExecutionState => {
          return TOO_LONG_TILE_EXECUTION;
        }),
      );

      const timeout$: Observable<TileExecutionState> = timer(
        EXECUTION_TIMEOUT_MS,
      ).pipe(
        map((): TileExecutionState => {
          return TIMEOUT_TILE_EXECUTION;
        }),
      );

      // started first, then the three racing escalations, collapsed.
      const lifecycle$ = concat(
        of<TileExecutionState>(STARTED_TILE_EXECUTION),
        merge(result$, tooLong$, timeout$).pipe(
          scan((acc: TileExecutionState, next: TileExecutionState) => {
            // Once terminal, ignore everything that follows (late result, or a
            // tooLong that fires after the run already settled).
            if (isTerminalTileExecution(acc)) {
              return acc;
            }

            return next;
          }, STARTED_TILE_EXECUTION as TileExecutionState),
          distinctUntilChanged(),
        ),
      );

      // Append the auto-dismiss timer once a terminal state is reached.
      // takeUntil(dismiss$) tears the whole run (and its timers) down the moment
      // the user dismisses — mirroring the old hook's clearTimers() on dismiss().
      return lifecycle$.pipe(
        switchMap((s) => {
          return isTerminalTileExecution(s)
            ? concat(
                of(s),
                timer(CONFIRMATION_DISMISS_MS).pipe(
                  map(() => {
                    return READY_TILE_EXECUTION;
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
        return READY_TILE_EXECUTION;
      }),
    ),
  );

  const state$: StateObservable<TileExecutionState> = state(
    stream$,
    READY_TILE_EXECUTION,
  );

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
