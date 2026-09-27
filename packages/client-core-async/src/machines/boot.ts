import type {
  BootSequenceIntents,
  BootSequenceState,
  Machine,
} from "@rtc/core-api";
import { bootProgress, nextBootVariant } from "@rtc/core-logic";
import { BOOT_TICK_MS, type BootVariant } from "@rtc/domain";

import { storeToWarmStateStream } from "#/bridge/out";
import { reportAsync } from "#/kernel/reportAsync";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

export interface BootMachineDeps {
  /** The variant this boot plays. */
  readonly variant: BootVariant;
  /** Persist the variant the NEXT boot plays. */
  readonly advance: (next: BootVariant) => void;
  /** Tell the shell the boot finished — at most once. */
  readonly onDone: () => void;
}

/** The boot splash's progress ramp: one `bootProgress(tick)` step every
 * `BOOT_TICK_MS` until 100, then `onDone` — or at once on `skip()`. The
 * persisted variant advances at creation, as the prototype does at boot
 * start. `dispose()` ends the ramp and `onDone` is never called after it. */
export function createBootMachine(
  deps: BootMachineDeps,
): Machine<BootSequenceState, BootSequenceIntents> {
  const { variant } = deps;
  deps.advance(nextBootVariant(variant));
  const store = createStore<BootSequenceState>({
    variant,
    progress: 0,
    done: false,
  });
  const warm = storeToWarmStateStream(store);
  const ramp = new AbortController();
  let finished = false;
  let disposed = false;

  function finish(): void {
    if (finished || disposed) {
      return;
    }

    finished = true;
    deps.onDone();
  }

  async function runRamp(): Promise<void> {
    for (let tick = 0; ; tick += 1) {
      const progress = bootProgress(tick);
      store.set({ variant, progress, done: progress >= 100 });

      if (progress >= 100) {
        finish();
        return;
      }

      await sleep(BOOT_TICK_MS, ramp.signal);
    }
  }

  void spawn(runRamp, reportAsync);

  return {
    state$: warm.state$,
    intents: {
      skip: () => {
        if (disposed) {
          return;
        }

        ramp.abort();
        store.set({ variant, progress: 100, done: true });
        finish();
      },
    },
    dispose: () => {
      disposed = true;
      ramp.abort();
      warm.release();
    },
  };
}
