import type { ReadOnlyMachine } from "@rtc/core-api";
import { BLOTTER_ROW_HIGHLIGHT_MS } from "@rtc/domain";

import { storeToStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

/** `isNew` at once, then `false` after `BLOTTER_ROW_HIGHLIGHT_MS`; a row that
 * is not new never changes. `dispose()` aborts the timer — an aborted sleep
 * is the normal end `spawn` swallows. */
export function createRowHighlightMachine(
  isNew: boolean,
): ReadOnlyMachine<boolean> {
  const store = createStore(isNew);
  const controller = new AbortController();

  if (isNew) {
    void spawn(async () => {
      await sleep(BLOTTER_ROW_HIGHLIGHT_MS, controller.signal);
      store.set(false);
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
