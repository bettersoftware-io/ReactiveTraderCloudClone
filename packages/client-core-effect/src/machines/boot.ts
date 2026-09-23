import { Effect, Exit, Fiber, Scope, SubscriptionRef } from "effect";

import { bootProgress, nextBootVariant } from "@rtc/client-core";
import type {
  BootSequenceIntents,
  BootSequenceState,
  Machine,
} from "@rtc/core-api";
import { BOOT_TICK_MS, type BootVariant } from "@rtc/domain";

import { createDetachedHost, refToWarmStateStream } from "#/bridge/out";

export interface BootMachineDeps {
  /** The variant this boot plays. */
  readonly variant: BootVariant;
  /** Persist the variant the NEXT boot plays. */
  readonly advance: (next: BootVariant) => void;
  /** Tell the shell the boot finished — at most once. */
  readonly onDone: () => void;
}

/** The boot splash's progress ramp: a fiber of `Effect.sleep(BOOT_TICK_MS)`
 * steps writing `bootProgress(tick)` until 100, then `onDone` — or at once
 * on `skip()`. A per-mount machine, so it owns a detached host whose scope
 * `dispose()` closes; `onDone` never runs after dispose. */
export function createBootMachine(
  deps: BootMachineDeps,
): Machine<BootSequenceState, BootSequenceIntents> {
  const { variant } = deps;
  deps.advance(nextBootVariant(variant));
  const host = createDetachedHost();
  const ref = host.runtime.runSync(
    SubscriptionRef.make<BootSequenceState>({
      variant,
      progress: 0,
      done: false,
    }),
  );
  const warm = refToWarmStateStream(host, ref);
  let finished = false;
  let disposed = false;

  function finish(): void {
    if (finished || disposed) {
      return;
    }

    finished = true;
    deps.onDone();
  }

  const ramp = Effect.gen(function* runRamp() {
    for (let tick = 0; ; tick += 1) {
      // The fiber starts on the scheduler, AFTER a skip() made in the same
      // tick as creation; without this it would write progress 0 over the
      // skipped state before the interrupt lands.
      if (finished || disposed) {
        return;
      }

      const progress = bootProgress(tick);
      yield* SubscriptionRef.set(ref, {
        variant,
        progress,
        done: progress >= 100,
      });

      if (progress >= 100) {
        yield* Effect.sync(finish);
        return;
      }

      yield* Effect.sleep(BOOT_TICK_MS);
    }
  });
  const rampFiber = host.runtime.runFork(ramp, { scope: host.scope });

  return {
    state$: warm.state$,
    intents: {
      skip: () => {
        if (disposed) {
          return;
        }

        Effect.runFork(Fiber.interrupt(rampFiber));
        host.runtime.runSync(
          SubscriptionRef.set(ref, { variant, progress: 100, done: true }),
        );
        finish();
      },
    },
    dispose: () => {
      disposed = true;
      warm.release();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
  };
}
