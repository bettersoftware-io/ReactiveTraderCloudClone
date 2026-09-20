import type { ReadOnlyMachine } from "@rtc/core-api";
import { RFQ_COUNTDOWN_INTERVAL_MS } from "@rtc/domain";

import { storeToStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

/** `remainingMs` from `totalMs − elapsed` (read ONCE, at construction) down
 * to an inclusive 0, one tick per `RFQ_COUNTDOWN_INTERVAL_MS`, derived from
 * the tick index — never the clock — so fake timers are exact. `dispose()`
 * aborts the ticks. */
export function createRfqCountdownMachine(
  creationTimestamp: number,
  totalMs: number,
  now: () => number = Date.now,
): ReadOnlyMachine<number> {
  const initial = Math.max(0, totalMs - (now() - creationTimestamp));
  const store = createStore(initial);
  const controller = new AbortController();

  if (initial > 0) {
    void spawn(async () => {
      for (let tick = 1; ; tick += 1) {
        await sleep(RFQ_COUNTDOWN_INTERVAL_MS, controller.signal);
        const remaining = Math.max(
          0,
          initial - tick * RFQ_COUNTDOWN_INTERVAL_MS,
        );
        store.set(remaining);

        if (remaining === 0) {
          return;
        }
      }
    }, reportAsync);
  }

  return {
    state$: storeToStateStream(store),
    intents: {},
    dispose: () => {
      controller.abort();
    },
  };
}
