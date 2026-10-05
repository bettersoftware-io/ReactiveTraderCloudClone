import { Duration, Effect } from "effect";

import type { ReadOnlyMachine } from "@rtc/core-api";
import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import { closeScope, createDetachedHost } from "#/bridge/out";
import { createSyncRef } from "#/bridge/syncRef";

/** `isNew` at once, then `false` after `BLOTTER_ROW_HIGHLIGHT_MS` on a fiber
 * forked into the machine's scope; `dispose()` closes the scope, which
 * interrupts the sleep. A row that is not new never changes. */
export function createRowHighlightMachine(
  isNew: boolean,
): ReadOnlyMachine<boolean> {
  const host = createDetachedHost();
  const ref = createSyncRef(isNew);

  if (isNew) {
    host.runtime.runFork(
      Effect.sleep(Duration.millis(BLOTTER_ROW_HIGHLIGHT_MS)).pipe(
        Effect.andThen(
          ref.write(() => {
            return false;
          }),
        ),
      ),
      { scope: host.scope },
    );
  }

  return {
    state$: ref.stateStream(),
    intents: {},
    dispose: () => {
      closeScope(host.scope);
    },
  };
}
