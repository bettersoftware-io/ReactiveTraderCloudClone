import { Duration, Effect, Exit, Scope, SubscriptionRef } from "effect";

import type { ReadOnlyMachine, RfqCountdownSeed } from "@rtc/core-api";
import { RFQ_COUNTDOWN_INTERVAL_MS } from "@rtc/domain";

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";

/** `remainingMs` from `totalMs − elapsed` (read ONCE, at construction) down
 * to an inclusive 0, one tick per `RFQ_COUNTDOWN_INTERVAL_MS`, derived from
 * the tick INDEX rather than the clock, so a fake clock is exact. ONE
 * looping fiber does the whole countdown — never a timer that forks its
 * successor, which a completing parent would interrupt (§22). `dispose()`
 * closes the machine's scope, which interrupts it. */
export function createRfqCountdownMachine(
  seed: RfqCountdownSeed,
  now: () => number = Date.now,
): ReadOnlyMachine<number> {
  const host = createDetachedHost();
  const initial = Math.max(0, seed.totalMs - (now() - seed.creationTimestamp));
  const ref = host.runtime.runSync(SubscriptionRef.make(initial));

  if (initial > 0) {
    host.runtime.runFork(
      Effect.gen(function* runCountdown() {
        for (let tick = 1; ; tick += 1) {
          yield* Effect.sleep(Duration.millis(RFQ_COUNTDOWN_INTERVAL_MS));
          const remaining = Math.max(
            0,
            initial - tick * RFQ_COUNTDOWN_INTERVAL_MS,
          );
          yield* setRefIfChanged(ref, () => {
            return remaining;
          });

          if (remaining === 0) {
            return;
          }
        }
      }),
      { scope: host.scope },
    );
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {},
    dispose: () => {
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
