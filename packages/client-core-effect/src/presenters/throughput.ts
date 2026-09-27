import { Effect, Fiber, Scope, SubscriptionRef } from "effect";

import type {
  ThroughputMessage,
  ThroughputPresenter,
  ThroughputView,
} from "@rtc/core-api";
import { THROUGHPUT_SET_ERROR, throughputSetMessage } from "@rtc/core-logic";
import {
  type AdminPort,
  DEFAULT_THROUGHPUT,
  THROUGHPUT_DEBOUNCE_MS,
  THROUGHPUT_MESSAGE_DISMISS_MS,
} from "@rtc/domain";

import {
  createChildHost,
  type EffectHost,
  refToStateStream,
  setRefIfChanged,
} from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createRunSlot, type Run } from "#/machines/runSlot";

const INITIAL: ThroughputView = {
  value: DEFAULT_THROUGHPUT,
  loading: true,
  message: null,
};

/** The admin throughput control — the async core's shape over a
 * `SubscriptionRef`. The port METHOD is called once, here; the load is run
 * on the first subscriber and lands `{ value, loading: false }`, or the
 * default on failure. `setValue` echoes the value at once and restarts a
 * debounce fiber; when `THROUGHPUT_DEBOUNCE_MS` of quiet elapses, the write
 * slot supersedes the previous write AND its banner dismiss (the RxJS
 * `debounceTime` → `switchMap` — supersede at the debounce, not the
 * keystroke). `Effect.sleep` follows vitest fake timers (measured in
 * `bridge/clock.test.ts`). Everything runs in a child of the app host's
 * scope, so `app.dispose()` ends the load, the timer and the write — and
 * `disposed` flips on the PARENT scope, before that child closes, so no
 * timer firing mid-close can start work in a closed scope. */
export function createThroughputPresenter(
  parent: EffectHost,
  admin: AdminPort,
): ThroughputPresenter {
  const host = createChildHost(parent);
  const ref = host.runtime.runSync(SubscriptionRef.make(INITIAL));
  const writes = createRunSlot(host, ref);
  const load$ = admin.getThroughput();
  let debounce: Fiber.RuntimeFiber<void> | null = null;
  let debounceToken: object | null = null;
  let loadStarted = false;
  let disposed = false;

  // Added to the PARENT after `createChildHost` forked the child, so a
  // sequential close (reverse order) runs it FIRST: the flag is up before
  // any fiber in the child scope is interrupted. On the child it would run
  // last — after the interrupts — leaving a window in which a debounce
  // firing mid-close forks an unowned write into the closed scope.
  host.runtime.runSync(
    Scope.addFinalizer(
      parent.scope,
      Effect.sync(() => {
        disposed = true;
      }),
    ),
  );

  function startLoadOnce(): void {
    if (loadStarted || disposed) {
      return;
    }

    loadStarted = true;
    host.runtime.runFork(
      rpc(load$).pipe(
        Effect.flatMap((value) => {
          return setRefIfChanged(ref, (view) => {
            return { ...view, value, loading: false };
          });
        }),
        Effect.catchAll(() => {
          return setRefIfChanged(ref, (view) => {
            return { ...view, value: DEFAULT_THROUGHPUT, loading: false };
          });
        }),
      ),
      { scope: host.scope },
    );
  }

  function persist(
    run: Run<ThroughputView>,
    value: number,
  ): Effect.Effect<void> {
    // `Effect.try`: a port that throws synchronously (the simulator's range
    // check) is a failed write, not a defect — the async core's banner.
    const written: Effect.Effect<ThroughputMessage> = Effect.try(() => {
      return admin.setThroughput(value);
    }).pipe(
      Effect.flatMap(rpc),
      Effect.as<ThroughputMessage>({
        text: throughputSetMessage(value),
        isError: false,
      }),
      Effect.catchAll(() => {
        return Effect.succeed<ThroughputMessage>({
          text: THROUGHPUT_SET_ERROR,
          isError: true,
        });
      }),
    );

    return written.pipe(
      Effect.flatMap((message) => {
        return run.write((view) => {
          return { ...view, message };
        });
      }),
      Effect.andThen(Effect.sleep(THROUGHPUT_MESSAGE_DISMISS_MS)),
      Effect.andThen(
        run.write((view) => {
          return { ...view, message: null };
        }),
      ),
    );
  }

  function setValue(value: number): void {
    if (disposed) {
      return;
    }

    host.runtime.runSync(
      setRefIfChanged(ref, (view) => {
        return { ...view, value };
      }),
    );

    if (debounce !== null) {
      Effect.runFork(Fiber.interrupt(debounce));
    }

    // The interrupt above is delivered asynchronously; an older timer due
    // in the same batch could still fire. The token makes it a no-op.
    const token = {};
    debounceToken = token;
    debounce = host.runtime.runFork(
      Effect.sleep(THROUGHPUT_DEBOUNCE_MS).pipe(
        Effect.andThen(
          Effect.sync(() => {
            if (disposed || debounceToken !== token) {
              return;
            }

            writes.start((run) => {
              return persist(run, value);
            });
          }),
        ),
      ),
      { scope: host.scope },
    );
  }

  return {
    state$: refToStateStream(host, ref, startLoadOnce),
    setValue,
  };
}
