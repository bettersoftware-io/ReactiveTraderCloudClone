import { Effect, Exit, Scope, SubscriptionRef } from "effect";

import type { Machine, NotionalIntents, NotionalView } from "@rtc/core-api";
import {
  createInitialNotionalView,
  reduceNotionalInput,
} from "@rtc/core-logic";

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";

/** A `SubscriptionRef` plus two intents; the view math is the RxJS core's,
 * imported. Each intent is one synchronous `setRefIfChanged`; `dispose()`
 * closes the machine's scope and makes the intents inert. */
export function createNotionalMachine(
  defaultNotional: number,
): Machine<NotionalView, NotionalIntents> {
  const host = createDetachedHost();
  const initial = createInitialNotionalView(defaultNotional);
  const ref = host.runtime.runSync(SubscriptionRef.make(initial));
  let disposed = false;

  function setView(view: NotionalView): void {
    if (!disposed) {
      host.runtime.runSync(
        setRefIfChanged(ref, () => {
          return view;
        }),
      );
    }
  }

  return {
    state$: refToStateStream(host, ref),
    intents: {
      change: (input: string) => {
        setView(reduceNotionalInput(defaultNotional, input));
      },
      reset: () => {
        setView(initial);
      },
    },
    dispose: () => {
      disposed = true;
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
