import { Clock, Duration, Effect } from "effect";

import { turnScheduler } from "#/bridge/turnScheduler";

/** `Effect.callback`, with every resume taken on the turn scheduler instead
 * of in the caller's stack — a resume made DURING `register` (a port that
 * answers synchronously) as much as one that arrives later (a port's
 * emission, a timer).
 *
 * Why. Effect 3 handed EVERY resume of an async boundary to the fiber's
 * scheduler (`FiberRuntime.initiateAsync` → `tell`), even one made inside
 * the registration, so crossing `rpc` always cost the fiber one hop to the
 * core's next turn (`bridge/turnScheduler.ts`). Effect 4 resumes it
 * SYNCHRONOUSLY, inside whatever called `resume`, and one made during
 * `register` never suspends at all. Two things broke that way:
 *
 * - a timer's callback ran the fiber's continuation before the code that
 *   fired the timer could act — a machine disposed in the same turn its
 *   redirect timer fired still redirected (`rfqSubmission.test.ts`);
 * - over a port that answers synchronously (the equities simulator's
 *   `candleHistory`) the whole of `loadOlder` — loading on, the page,
 *   loading off — ran inside the UI's call, so the chart's near-edge
 *   effect never saw `loadingOlder$` in flight, and panning to the left
 *   edge hung the page (e2e `equitiesChart.spec.ts` "backfills an older
 *   page"; `candleSeries.test.ts` pins the hop).
 *
 * Taken on the turn, the step lands where it landed on effect 3, and an
 * interrupt that arrives first still wins (a resume after the fiber was
 * interrupted is ignored). */
export function callbackOnTurn<A, E = never>(
  register: (
    resume: (effect: Effect.Effect<A, E>) => void,
  ) => void | Effect.Effect<void>,
): Effect.Effect<A, E> {
  return Effect.callback<A, E>((resume) => {
    return register((effect: Effect.Effect<A, E>) => {
      turnScheduler.scheduleTask(() => {
        resume(effect);
      }, 0);
    });
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
