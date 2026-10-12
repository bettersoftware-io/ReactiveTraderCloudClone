import type { Machine, NotionalIntents, NotionalView } from "@rtc/core-api";
import {
  createInitialNotionalView,
  reduceNotionalInput,
} from "@rtc/core-logic";

import { createSyncRef } from "#/bridge/syncRef";

/** A `SyncRef` plus two intents; the view math is the RxJS core's,
 * imported. Each intent is one synchronous write; `dispose()` makes the
 * intents inert. No host: the machine forks nothing and subscribes no
 * port, so there is no scope to close. */
export function createNotionalMachine(
  defaultNotional: number,
): Machine<NotionalView, NotionalIntents> {
  const initial = createInitialNotionalView(defaultNotional);
  const ref = createSyncRef(initial);
  let disposed = false;

  function setView(view: NotionalView): void {
    if (!disposed) {
      ref.set(() => {
        return view;
      });
    }
  }

  return {
    state$: ref.stateStream(),
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
    },
  };
}
