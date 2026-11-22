import { Clock, Duration, Effect } from "effect";

import { turnScheduler } from "#/bridge/turnScheduler";

/** `Effect.callback`, with a resume that arrives LATER — from a port's
 * emission, a timer, any callback outside the fiber — taken on the turn
 * scheduler instead of in the caller's stack.
 *
 * Why. Effect 3 resumed a suspended fiber on its scheduler, so a fiber
 * woken by a port or a timer ran its next step in the core's next turn
 * (`bridge/turnScheduler.ts`). Effect 4 resumes it SYNCHRONOUSLY, inside
 * whatever called `resume`: a port's `next` would run the fiber's
 * continuation re-entrantly before the port's own emission returned, and a
 * timer's callback would run it before the code that fired the timer could
 * act — a machine disposed in the same turn its redirect timer fired still
 * redirected (`rfqSubmission.test.ts`). Taken on the turn, the step lands
 * where it landed on effect 3, and an interrupt that arrives first still
 * wins (a resume after the fiber was interrupted is ignored).
 *
 * A resume made DURING `register` is still taken at once, as both versions
 * take it: the fiber has not suspended yet. */
export function callbackOnTurn<A, E = never>(
  register: (
    resume: (effect: Effect.Effect<A, E>) => void,
  ) => void | Effect.Effect<void>,
): Effect.Effect<A, E> {
  return Effect.callback<A, E>((resume) => {
    let registering = true;

    try {
      return register((effect: Effect.Effect<A, E>) => {
        if (registering) {
          resume(effect);
          return;
        }

        turnScheduler.scheduleTask(() => {
          resume(effect);
        }, 0);
      });
    } finally {
      registering = false;
    }
  });
}

/** The default clock, with `sleep` waking its fiber on the turn scheduler
 * (`callbackOnTurn`, which says why) — every `Effect.sleep`, `timeoutOrElse`
 * and kin the core runs goes through it, because `runnerFor` puts it in
 * every host's context. Its timer is the global `setTimeout`, as the default
 * clock's is, so it still follows vitest's fake timers. */
function createTurnClock(base: Clock.Clock): Clock.Clock {
  return {
    currentTimeMillisUnsafe: () => {
      return base.currentTimeMillisUnsafe();
    },
    currentTimeMillis: base.currentTimeMillis,
    currentTimeNanosUnsafe: () => {
      return base.currentTimeNanosUnsafe();
    },
    currentTimeNanos: base.currentTimeNanos,
    monotonicTimeNanosUnsafe: () => {
      return base.monotonicTimeNanosUnsafe();
    },
    monotonicTimeNanos: base.monotonicTimeNanos,
    sleep: (duration: Duration.Duration) => {
      return sleepOnTurn(Duration.toMillis(duration));
    },
  };
}

/** The longest delay `setTimeout` takes; a longer sleep is a chain of them,
 * as the default clock's is. */
const MAX_TIMER_MILLIS = 2 ** 31 - 1;

function sleepOnTurn(millis: number): Effect.Effect<void> {
  if (millis <= 0) {
    return Effect.yieldNow;
  }

  if (!Number.isFinite(millis)) {
    return Effect.never;
  }

  return callbackOnTurn<void>((resume) => {
    const continuation =
      millis > MAX_TIMER_MILLIS
        ? sleepOnTurn(millis - MAX_TIMER_MILLIS)
        : Effect.void;

    const handle = setTimeout(
      () => {
        resume(continuation);
      },
      Math.min(millis, MAX_TIMER_MILLIS),
    );

    return Effect.sync(() => {
      clearTimeout(handle);
    });
  });
}

/** The one clock every host of this core runs with (`runnerFor`,
 * `bridge/out.ts`). */
export const turnClock: Clock.Clock = createTurnClock(
  Clock.Clock.defaultValue(),
);
