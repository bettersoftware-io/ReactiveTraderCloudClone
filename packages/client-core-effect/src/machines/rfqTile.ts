import {
  Duration,
  Effect,
  Exit,
  Fiber,
  Option,
  Scope,
  SubscriptionRef,
} from "effect";

import type {
  Machine,
  RfqQuote,
  RfqState,
  RfqTileIntents,
  Stream,
} from "@rtc/core-api";
import {
  type CurrencyPair,
  REJECTED_DISPLAY_MS,
  RFQ_COUNTDOWN_INTERVAL_MS,
  RFQ_TIMEOUT_MS,
  type RfqQuoteResult,
} from "@rtc/domain";

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";

export interface RfqTileDeps {
  /** The request-quote command (`RfqQuotePresenter.requestQuote`), injected
   * so timing is controllable in tests. */
  requestQuote: (
    symbol: string,
    pipsPosition: number,
  ) => Stream<RfqQuoteResult>;
}

/** What a run writes with: a guard on the run token, so a run superseded a
 * fiber-step ago cannot write over its successor's state. */
type Write = (next: (current: RfqState) => RfqState) => Effect.Effect<void>;

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };
const REQUESTED: RfqState = {
  status: "requested",
  quote: null,
  remainingMs: 0,
};
const REJECTED: RfqState = { status: "rejected", quote: null, remainingMs: 0 };

/** The RxJS machine's one-run-per-request shape on a `SubscriptionRef`
 * under a detached host: `requested`, then a received countdown derived
 * from the tick index in ONE looping fiber (never a timer that forks its
 * successor — a forked child is interrupted when its parent completes,
 * §22), falling through to the rejected hold at zero, or the hold at once
 * when the request fails. `cancel`/`accept` interrupt the run and reset;
 * `reject` interrupts it and runs the hold alone; intents are guarded to
 * their state. Interruption releases the in-flight port call through
 * `rpc`'s finalizer. */
export function createRfqTileMachine(
  pair: CurrencyPair,
  deps: RfqTileDeps,
): Machine<RfqState, RfqTileIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make<RfqState>(INIT));
  // The live run's token and fiber. The token guards every write:
  // interruption lands at the run's next suspension, not at the
  // `Fiber.interrupt` call, so a superseded run must not be able to write
  // over its successor's state (`tileExecution`'s shape).
  let active: object | null = null;
  let activeFiber: Fiber.RuntimeFiber<void> | null = null;
  let disposed = false;

  function current(): RfqState {
    return host.runtime.runSync(SubscriptionRef.get(ref));
  }

  function endActive(): void {
    active = null;

    if (activeFiber !== null) {
      Effect.runFork(Fiber.interrupt(activeFiber));
      activeFiber = null;
    }
  }

  function holdRejected(write: Write): Effect.Effect<void> {
    return Effect.gen(function* runRejectedHold() {
      yield* write(() => {
        return REJECTED;
      });
      yield* Effect.sleep(Duration.millis(REJECTED_DISPLAY_MS));
      yield* write(() => {
        return INIT;
      });
    });
  }

  function runQuote(write: Write): Effect.Effect<void> {
    return Effect.gen(function* runQuoteRequest() {
      yield* write(() => {
        return REQUESTED;
      });
      const result = yield* rpc(
        deps.requestQuote(pair.symbol, pair.pipsPosition),
      ).pipe(
        Effect.map(Option.some),
        Effect.catchAll(() => {
          return Effect.succeed(Option.none<RfqQuoteResult>());
        }),
      );

      if (Option.isSome(result)) {
        const quote: RfqQuote = {
          bid: result.value.bid,
          ask: result.value.ask,
          timeoutMs: RFQ_TIMEOUT_MS,
        };

        for (
          let remainingMs = RFQ_TIMEOUT_MS;
          remainingMs > 0;
          remainingMs -= RFQ_COUNTDOWN_INTERVAL_MS
        ) {
          const tick: RfqState = { status: "received", quote, remainingMs };
          yield* write(() => {
            return tick;
          });
          yield* Effect.sleep(Duration.millis(RFQ_COUNTDOWN_INTERVAL_MS));
        }
      }

      yield* holdRejected(write);
    });
  }

  function start(build: (write: Write) => Effect.Effect<void>): void {
    endActive();
    const token = {};
    active = token;

    function write(next: (state: RfqState) => RfqState): Effect.Effect<void> {
      return Effect.suspend(() => {
        return active === token ? setRefIfChanged(ref, next) : Effect.void;
      });
    }

    activeFiber = host.runtime.runFork(build(write), { scope: host.scope });
  }

  function reset(): void {
    endActive();
    host.runtime.runSync(
      setRefIfChanged(ref, () => {
        return INIT;
      }),
    );
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      requestQuote: () => {
        if (!disposed && current().status === "init") {
          start(runQuote);
        }
      },
      cancel: () => {
        if (!disposed && current().status === "requested") {
          reset();
        }
      },
      accept: () => {
        if (!disposed && current().status === "received") {
          reset();
        }
      },
      reject: () => {
        if (!disposed && current().status === "received") {
          start(holdRejected);
        }
      },
    },
    dispose: () => {
      disposed = true;
      endActive();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
