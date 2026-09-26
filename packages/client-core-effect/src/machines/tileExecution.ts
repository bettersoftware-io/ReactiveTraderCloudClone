import { Duration, Effect, SubscriptionRef } from "effect";

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

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createRunSlot, type Run } from "#/machines/runSlot";

export interface TileExecutionDeps {
  /** The execute command (`TradeExecutionPresenter.execute`), injected so
   * timing is controllable in tests. */
  execute: (input: ExecuteTradeInput) => Stream<ExecuteTradeResult>;
}

/** One `execute()` run: `Effect.race` of the RPC against `Effect.sleep`,
 * the too-long marker a forked sleep (a child of the run, interrupted with
 * it), `run.write` giving switch-map semantics through `createRunSlot`'s
 * token guard. The too-long child does NOT get cancelled by the outcome
 * landing — the run does not finish until `CONFIRMATION_DISMISS_MS` after
 * the outcome, so at TOO_LONG_THRESHOLD_MS the child fiber is still alive;
 * it is the write's terminal guard (`isTerminalTileExecution`) that
 * suppresses it, not interruption. That guard's correctness rests on
 * TOO_LONG_THRESHOLD_MS < CONFIRMATION_DISMISS_MS: the marker fires at
 * 2 000 ms while the auto-dismiss returns to `ready` no earlier than
 * outcome + 5 000 ms, so the guard can never see a `ready` state. If the
 * constants ever cross, a dismissed tile would re-enter `tooLong`. A
 * failing command is `finished{Timeout}`, not the `timeout` state; the
 * confirmation dismisses itself after `CONFIRMATION_DISMISS_MS`. */
function runExecution(
  input: ExecuteTradeInput,
  deps: TileExecutionDeps,
  run: Run<TileExecutionState>,
): Effect.Effect<void> {
  return Effect.gen(function* runExecutionBody() {
    yield* run.write(() => {
      return STARTED_TILE_EXECUTION;
    });
    yield* Effect.fork(
      Effect.sleep(Duration.millis(TOO_LONG_THRESHOLD_MS)).pipe(
        Effect.andThen(
          run.write((current) => {
            return isTerminalTileExecution(current)
              ? current
              : TOO_LONG_TILE_EXECUTION;
          }),
        ),
      ),
    );
    const outcome = yield* Effect.race(
      rpc(deps.execute(input)).pipe(
        Effect.map(finishedTileExecution),
        Effect.catchAll(() => {
          return Effect.succeed(TIMED_OUT_TILE_EXECUTION);
        }),
      ),
      Effect.sleep(Duration.millis(EXECUTION_TIMEOUT_MS)).pipe(
        Effect.as(TIMEOUT_TILE_EXECUTION),
      ),
    );
    yield* run.write(() => {
      return outcome;
    });
    yield* Effect.sleep(Duration.millis(CONFIRMATION_DISMISS_MS));
    yield* run.write(() => {
      return READY_TILE_EXECUTION;
    });
  });
}

/** The RxJS machine's shape on a `SubscriptionRef` under a detached host,
 * with `createRunSlot` owning the run token and fiber: `execute()` starts a
 * fresh run (superseding any in flight), `dismiss()` ends the run in flight
 * and writes `ready` directly, `dispose()` ends everything and closes the
 * host's scope. */
export function createTileExecutionMachine(
  pair: CurrencyPair,
  deps: TileExecutionDeps,
): Machine<TileExecutionState, TileExecutionIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(
    SubscriptionRef.make<TileExecutionState>(READY_TILE_EXECUTION),
  );
  const slot = createRunSlot(host, ref);

  return {
    state$: refToStateStream(host, ref),
    intents: {
      execute: (direction: Direction, price: Price, notional: number) => {
        if (slot.isDisposed()) {
          return;
        }

        const input: ExecuteTradeInput = { pair, direction, price, notional };
        slot.start((run: Run<TileExecutionState>) => {
          return runExecution(input, deps, run);
        });
      },
      dismiss: () => {
        if (slot.isDisposed()) {
          return;
        }

        slot.end();
        host.runtime.runSync(
          setRefIfChanged(ref, () => {
            return READY_TILE_EXECUTION;
          }),
        );
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
