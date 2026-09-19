import { Duration, Effect, Exit, Fiber, Scope, SubscriptionRef } from "effect";

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

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

export interface TileExecutionDeps {
  /** The execute command (`TradeExecutionPresenter.execute`), injected so
   * timing is controllable in tests. */
  execute: (input: ExecuteTradeInput) => Stream<ExecuteTradeResult>;
}

/** The spec's Effect sketch: `Effect.race` of the RPC against
 * `Effect.sleep`, the too-long marker a forked sleep (a child of the run,
 * interrupted with it — so finishing cancels the escalation), switch-map
 * semantics `Fiber.interrupt` of the previous run; `dismiss()` interrupts
 * and resets; `dispose()` closes the machine's scope. A failing command is
 * `finished{Timeout}`, not the `timeout` state; the confirmation dismisses
 * itself after `CONFIRMATION_DISMISS_MS`. */
export function createTileExecutionMachine(
  pair: CurrencyPair,
  deps: TileExecutionDeps,
): Machine<TileExecutionState, TileExecutionIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(
    SubscriptionRef.make<TileExecutionState>(READY_TILE_EXECUTION),
  );
  // The live run's token and fiber. The token guards every write: a run
  // superseded a fiber-step ago cannot write over its successor's state
  // (interruption lands at the run's next suspension, not at the
  // `Fiber.interrupt` call).
  let active: object | null = null;
  let activeFiber: Fiber.RuntimeFiber<void> | null = null;
  let disposed = false;

  function endActive(): void {
    active = null;

    if (activeFiber !== null) {
      Effect.runFork(Fiber.interrupt(activeFiber));
      activeFiber = null;
    }
  }

  function startRun(input: ExecuteTradeInput): void {
    const token = {};
    active = token;

    function write(
      next: (current: TileExecutionState) => TileExecutionState,
    ): Effect.Effect<void> {
      return Effect.suspend(() => {
        return active === token ? setRefIfChanged(ref, next) : Effect.void;
      });
    }

    const body = Effect.gen(function* runExecution() {
      yield* write(() => {
        return STARTED_TILE_EXECUTION;
      });
      yield* Effect.fork(
        Effect.sleep(Duration.millis(TOO_LONG_THRESHOLD_MS)).pipe(
          Effect.andThen(
            write((current) => {
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
      yield* write(() => {
        return outcome;
      });
      yield* Effect.sleep(Duration.millis(CONFIRMATION_DISMISS_MS));
      yield* write(() => {
        return READY_TILE_EXECUTION;
      });
    });

    activeFiber = host.runtime.runFork(body, { scope: host.scope });
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      execute: (direction: Direction, price: Price, notional: number) => {
        if (disposed) {
          return;
        }

        endActive();
        startRun({ pair, direction, price, notional });
      },
      dismiss: () => {
        if (disposed) {
          return;
        }

        endActive();
        host.runtime.runSync(
          setRefIfChanged(ref, () => {
            return READY_TILE_EXECUTION;
          }),
        );
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
