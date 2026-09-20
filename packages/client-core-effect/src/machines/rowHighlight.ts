import { Duration, Effect, Exit, Scope, SubscriptionRef } from "effect";

import type { ReadOnlyMachine } from "@rtc/core-api";
import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import {
  createDetachedHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";

/** `isNew` at once, then `false` after `BLOTTER_ROW_HIGHLIGHT_MS` on a fiber
 * forked into the machine's scope; `dispose()` closes the scope, which
 * interrupts the sleep. A row that is not new never changes. */
export function createRowHighlightMachine(
  isNew: boolean,
): ReadOnlyMachine<boolean> {
  const host = createDetachedHost();
  const ref = host.runtime.runSync(SubscriptionRef.make(isNew));

  if (isNew) {
    host.runtime.runFork(
      Effect.sleep(Duration.millis(BLOTTER_ROW_HIGHLIGHT_MS)).pipe(
        Effect.andThen(
          setRefIfChanged(ref, () => {
            return false;
          }),
        ),
      ),
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
