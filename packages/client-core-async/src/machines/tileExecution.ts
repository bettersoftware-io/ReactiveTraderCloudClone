import {
  finishedTileExecution,
  isTerminalTileExecution,
  READY_TILE_EXECUTION,
  STARTED_TILE_EXECUTION,
  TIMED_OUT_TILE_EXECUTION,
  TIMEOUT_TILE_EXECUTION,
  TOO_LONG_TILE_EXECUTION,
} from "@rtc/client-core";
import type {
  Machine,
  Stream,
  TileExecutionIntents,
  TileExecutionState,
} from "@rtc/core-api";
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
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
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
  let active: AbortController | null = null;
  let disposed = false;

  function endActive(): void {
    active?.abort();
    active = null;
  }

  async function run(
    input: ExecuteTradeInput,
    signal: AbortSignal,
  ): Promise<void> {
    store.set(STARTED_TILE_EXECUTION);
    // This sleep is never cancelled on outcome (only on abort), and its
    // guard reads the LIVE store — unlike the RxJS core, whose guard reads
    // the scan accumulator, which is already terminal by the time this
    // fires. Correctness here rests on a precondition, not cancellation:
    // TOO_LONG_THRESHOLD_MS < CONFIRMATION_DISMISS_MS. The marker fires at
    // 2 000 ms while the auto-dismiss returns the store to `ready` no
    // earlier than outcome + 5 000 ms, so this guard can never observe a
    // `ready` store. If the constants ever cross, a dismissed tile would
    // re-enter `tooLong`.
    void sleep(TOO_LONG_THRESHOLD_MS, signal).then(
      () => {
        store.set((current) => {
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
      once(deps.execute(input), signal).then(
        finishedTileExecution,
        (error: unknown) => {
          if (error instanceof AbortError) {
            throw error;
          }

          return TIMED_OUT_TILE_EXECUTION;
        },
      ),
      sleep(EXECUTION_TIMEOUT_MS, signal).then(() => {
        return TIMEOUT_TILE_EXECUTION;
      }),
    ]);
    store.set(outcome);
    await sleep(CONFIRMATION_DISMISS_MS, signal);
    store.set(READY_TILE_EXECUTION);
  }

  return {
    state$: storeToStateStream(store),
    intents: {
      execute: (direction: Direction, price: Price, notional: number) => {
        if (disposed) {
          return;
        }

        endActive();
        const controller = new AbortController();
        active = controller;
        void spawn(() => {
          return run({ pair, direction, price, notional }, controller.signal);
        }, reportAsync);
      },
      dismiss: () => {
        if (disposed) {
          return;
        }

        endActive();
        store.set(READY_TILE_EXECUTION);
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
    },
  };
}
