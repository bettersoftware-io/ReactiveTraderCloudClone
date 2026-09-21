import { Duration, Effect, Option, SubscriptionRef } from "effect";

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
import { createRunSlot, type Run } from "#/machines/runSlot";

export interface RfqTileDeps {
  /** The request-quote command (`RfqQuotePresenter.requestQuote`), injected
   * so timing is controllable in tests. */
  requestQuote: (
    symbol: string,
    pipsPosition: number,
  ) => Stream<RfqQuoteResult>;
}

const INIT: RfqState = { status: "init", quote: null, remainingMs: 0 };
const REQUESTED: RfqState = {
  status: "requested",
  quote: null,
  remainingMs: 0,
};
const REJECTED: RfqState = { status: "rejected", quote: null, remainingMs: 0 };

function holdRejected(run: Run<RfqState>): Effect.Effect<void> {
  return Effect.gen(function* runRejectedHold() {
    yield* run.write(() => {
      return REJECTED;
    });
    yield* Effect.sleep(Duration.millis(REJECTED_DISPLAY_MS));
    yield* run.write(() => {
      return INIT;
    });
  });
}

function runQuote(
  pair: CurrencyPair,
  deps: RfqTileDeps,
  run: Run<RfqState>,
): Effect.Effect<void> {
  return Effect.gen(function* runQuoteRequest() {
    yield* run.write(() => {
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
        yield* run.write(() => {
          return tick;
        });
        yield* Effect.sleep(Duration.millis(RFQ_COUNTDOWN_INTERVAL_MS));
      }
    }

    yield* holdRejected(run);
  });
}

/** The RxJS machine's one-run-per-request shape on a `SubscriptionRef`
 * under a detached host, with `createRunSlot` owning the run token and
 * fiber: `requested`, then a received countdown derived from the tick
 * index in ONE looping fiber (never a timer that forks its successor — a
 * forked child is interrupted when its parent completes, §22), falling
 * through to the rejected hold at zero, or the hold at once when the
 * request fails. `cancel`/`accept` end the run and reset; `reject` ends it
 * and runs the hold alone; intents are guarded to their state. Interruption
 * releases the in-flight port call through `rpc`'s finalizer. */
export function createRfqTileMachine(
  pair: CurrencyPair,
  deps: RfqTileDeps,
): Machine<RfqState, RfqTileIntents> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make<RfqState>(INIT));
  const slot = createRunSlot(host, ref);

  function current(): RfqState {
    return host.runtime.runSync(SubscriptionRef.get(ref));
  }

  function reset(): void {
    slot.end();
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
        if (!slot.isDisposed() && current().status === "init") {
          slot.start((run: Run<RfqState>) => {
            return runQuote(pair, deps, run);
          });
        }
      },
      cancel: () => {
        if (!slot.isDisposed() && current().status === "requested") {
          reset();
        }
      },
      accept: () => {
        if (!slot.isDisposed() && current().status === "received") {
          reset();
        }
      },
      reject: () => {
        if (!slot.isDisposed() && current().status === "received") {
          slot.start((run: Run<RfqState>) => {
            return holdRejected(run);
          });
        }
      },
    },
    dispose: () => {
      slot.dispose();
    },
  };
}
