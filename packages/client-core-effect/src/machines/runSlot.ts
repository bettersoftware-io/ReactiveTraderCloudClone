import {
  Cause,
  Effect,
  Exit,
  Fiber,
  Scope,
  type SubscriptionRef,
} from "effect";

import {
  type EffectHost,
  reportOutOfBand,
  setRefIfChanged,
} from "#/bridge/out";

/** What a run acts through: a write to the ref, or any other externally
 * visible step, both guarded on the run token so a run superseded a
 * fiber-step ago cannot act on behalf of its successor. */
export interface Run<S> {
  /** `setRefIfChanged`, skipped once this run is no longer the live one. */
  write(next: (current: S) => S): Effect.Effect<void>;
  /** `step`, skipped once this run is no longer the live one — for an
   * effect the world can see that is not a state write. */
  guarded(step: Effect.Effect<void>): Effect.Effect<void>;
}

/** "At most one live run" for a ref-backed machine, one per machine. */
export interface RunSlot<S> {
  /** End the run in flight, if any, and start `build` as the live run.
   * Calling `start` from INSIDE a live build self-interrupts that calling
   * run first, exactly as a superseding `start` from outside does —
   * `switchMap`-correct — so the second run executes and every later
   * `write`/`guarded` the caller's own continuation yields is dropped. */
  start(build: (run: Run<S>) => Effect.Effect<void, unknown>): void;
  end(): void;
  /** End the run in flight, refuse every later `start`, and close the
   * host's scope. Idempotent. */
  dispose(): void;
  isDisposed(): boolean;
}

/** "At most one live run" for a ref-backed machine. `start` interrupts the
 * run in flight and forks the next; the run reaches the world only through
 * its `Run`, whose `write`/`guarded` check the run TOKEN first —
 * interruption lands at a fiber's next suspension, not at the
 * `Fiber.interrupt` call, so a run superseded a fiber-step ago must not be
 * able to write over, or act on behalf of, its successor (slice 3 R10: the
 * invariant rests on the token this slot owns, not on when Effect chooses to
 * deliver an interrupt). A failing build is rethrown out of band: a ref has
 * no error channel (slice 2 ruling 8). */
export function createRunSlot<S>(
  host: EffectHost,
  ref: SubscriptionRef.SubscriptionRef<S>,
): RunSlot<S> {
  let active: object | null = null;
  let activeFiber: Fiber.RuntimeFiber<void> | null = null;
  let disposed = false;

  function end(): void {
    active = null;

    if (activeFiber !== null) {
      Effect.runFork(Fiber.interrupt(activeFiber));
      activeFiber = null;
    }
  }

  return {
    start: (build: (run: Run<S>) => Effect.Effect<void, unknown>) => {
      if (disposed) {
        return;
      }

      end();
      const token = {};
      active = token;

      function guarded(step: Effect.Effect<void>): Effect.Effect<void> {
        return Effect.suspend(() => {
          return active === token ? step : Effect.void;
        });
      }

      const run: Run<S> = {
        guarded,
        write: (next: (current: S) => S) => {
          return guarded(setRefIfChanged(ref, next));
        },
      };
      activeFiber = host.runtime.runFork(
        build(run).pipe(
          Effect.catchAllCause((cause) => {
            return Effect.sync(() => {
              if (!Cause.isInterruptedOnly(cause)) {
                reportOutOfBand(cause);
              }
            });
          }),
        ),
        { scope: host.scope },
      );
    },
    end,
    dispose: () => {
      if (disposed) {
        return;
      }

      disposed = true;
      end();
      Effect.runFork(Scope.close(host.scope, Exit.void));
    },
    isDisposed: () => {
      return disposed;
    },
  };
}
