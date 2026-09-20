import {
  createInitialNotionalView,
  reduceNotionalInput,
} from "@rtc/client-core";
import type { Machine, NotionalIntents, NotionalView } from "@rtc/core-api";

import { storeToStateStream } from "#/bridge/out";
import { createStore } from "#/kernel/store";

/** A Store plus two intents; the view math is the RxJS core's, imported.
 * `dispose()` makes the intents inert — there is nothing warm to end. */
export function createNotionalMachine(
  defaultNotional: number,
): Machine<NotionalView, NotionalIntents> {
  const initial = createInitialNotionalView(defaultNotional);
  const store = createStore<NotionalView>(initial);
  let disposed = false;

  return {
    state$: storeToStateStream(store),
    intents: {
      change: (input: string) => {
        if (!disposed) {
          store.set(reduceNotionalInput(defaultNotional, input));
        }
      },
      reset: () => {
        if (!disposed) {
          store.set(initial);
        }
      },
    },
    dispose: () => {
      disposed = true;
    },
  };
}
