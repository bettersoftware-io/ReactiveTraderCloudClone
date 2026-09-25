import type {
  Machine,
  Stream,
  TileExecutionIntents,
  TileExecutionState,
} from "@rtc/core-api";
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

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { createRunSlot, type Run } from "#/kernel/runSlot";
import { sleep } from "#/kernel/sleep";
import { createStore } from "#/kernel/store";

export interface TileExecutionDeps {
  /** The execute command (`TradeExecutionPresenter.execute`), injected so
   * timing is controllable in tests. */
  execute: (input: ExecuteTradeInput) => Stream<ExecuteTradeResult>;
}

/** The spec's sketch, verbatim in shape: one `run` per `execute()`, cancelled
 * by the next `execute()` (`switchMap`), by `dismiss()` (`takeUntil`) and by
 * `dispose()` — all three abort the run's controller, which ends its sleeps
 * and releases the in-flight port call through `once`'s signal. The
 * too-long marker is a forked sleep that does nothing once the state is
 * terminal; the outcome is a race between the command and the timeout; a
 * failing command is `finished{Timeout}`, not the `timeout` state; the
 * confirmation dismisses itself after `CONFIRMATION_DISMISS_MS`. A result
 * landing after the timeout won is ignored by the race. */
export function createTileExecutionMachine(
  pair: CurrencyPair,
  deps: TileExecutionDeps,
): Machine<TileExecutionState, TileExecutionIntents> {
  const store = createStore<TileExecutionState>(READY_TILE_EXECUTION);
  const slot = createRunSlot(store);

  async function runExecution(
    input: ExecuteTradeInput,
    run: Run<TileExecutionState>,
  ): Promise<void> {
    run.set(STARTED_TILE_EXECUTION);
    // This sleep is never cancelled on outcome (only on abort), and its
    // guard reads the LIVE store — unlike the RxJS core, whose guard reads
    // the scan accumulator, which is already terminal by the time this
    // fires. Correctness here rests on a precondition, not cancellation:
    // TOO_LONG_THRESHOLD_MS < CONFIRMATION_DISMISS_MS. The marker fires at
    // 2 000 ms while the auto-dismiss returns the store to `ready` no
    // earlier than outcome + 5 000 ms, so this guard can never observe a
    // `ready` store. If the constants ever cross, a dismissed tile would
    // re-enter `tooLong`.
    void sleep(TOO_LONG_THRESHOLD_MS, run.signal).then(
      () => {
        run.set((current) => {
          return isTerminalTileExecution(current)
            ? current
            : TOO_LONG_TILE_EXECUTION;
        });
      },
      () => {
        // Aborted: the run ended first.
      },
    );
    const outcome = await Promise.race([
      once(deps.execute(input), run.signal).then(
        finishedTileExecution,
        (error: unknown) => {
          if (error instanceof AbortError) {
            throw error;
          }

          return TIMED_OUT_TILE_EXECUTION;
        },
      ),
      sleep(EXECUTION_TIMEOUT_MS, run.signal).then(() => {
        return TIMEOUT_TILE_EXECUTION;
      }),
    ]);
    run.set(outcome);
    await sleep(CONFIRMATION_DISMISS_MS, run.signal);
    run.set(READY_TILE_EXECUTION);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      execute: (direction: Direction, price: Price, notional: number) => {
        slot.start((run) => {
          return runExecution({ pair, direction, price, notional }, run);
        });
      },
      dismiss: () => {
        if (slot.isDisposed()) {
          return;
        }

        slot.end();
        store.set(READY_TILE_EXECUTION);
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
