import { Duration, Effect, Fiber, Option, Ref, Stream } from "effect";

import type { Stream as CoreStream } from "@rtc/core-api";

import {
  type EffectHost,
  type FoldUpdate,
  type FromPort,
  sharedFold,
} from "#/bridge/out";
import { peekCurrent } from "#/bridge/peek";

/** One input of the conflation fold. */
type ConflationEvent<T> =
  | { readonly kind: "tick"; readonly value: T }
  | { readonly kind: "calm"; readonly on: boolean };

/** The fold's state, held in ONE `Ref` so every transition is an atomic
 * `Ref.modify` — the window timer fires on its own fiber, and a `get`
 * followed by a `set` would let it interleave between them. */
interface ConflationState<T> {
  readonly calm: Option.Option<boolean>;
  readonly window: Option.Option<Fiber.RuntimeFiber<void>>;
  readonly pending: Option.Option<T>;
}

/** What a transition asks the runner to do, after the state has moved. */
type ConflationAction<T> =
  | { readonly kind: "none" }
  | { readonly kind: "emit"; readonly value: T }
  | { readonly kind: "emitAndOpen"; readonly value: T }
  | { readonly kind: "interrupt"; readonly fiber: Fiber.RuntimeFiber<void> };

/** The RxJS core's `conflateWhen(flag$, ms)` restated inside a `sharedFold`'s
 * `run`: a leading+trailing throttle gated by the calm flag. While calm, a
 * value with no window open is emitted at once and opens a window of `ms`
 * (a forked `Effect.sleep`); values inside the window replace the pending
 * slot; at the window's end the pending value (if any) is emitted and a new
 * window opens. While not calm, every value passes. Calm → off interrupts
 * the window and drops its pending value; off → calm starts fresh. Values
 * before the flag has spoken are dropped. Hand-written because Effect has
 * no leading+trailing throttle (`Stream.throttle` is a token bucket,
 * `aggregateWithin` trailing-only) — slice 2 ruling 7. */
export function conflatedFold<T>(
  host: EffectHost,
  source: CoreStream<T>,
  calm$: CoreStream<boolean>,
  ms: number,
  seed: () => Option.Option<T>,
): CoreStream<T> {
  return sharedFold(host, {
    seed,
    run: (update: FoldUpdate<T>, fromPort: FromPort) => {
      // Subscribed HERE, in plain synchronous code, not inside the
      // `Effect.gen` below: `fromPort` is eager by design (see
      // `bridge/in.ts`), so the period owns both subscriptions from the
      // moment it starts.
      const calmEvents = fromPort(calm$).pipe(
        Stream.map((on): ConflationEvent<T> => {
          return { kind: "calm", on };
        }),
      );

      const tickEvents = fromPort(source).pipe(
        Stream.map((value): ConflationEvent<T> => {
          return { kind: "tick", value };
        }),
      );

      return Effect.gen(function* foldConflation() {
        // MEASURED: `Stream.merge` gives no ordering across its two
        // sources, and it drains the tick queue FIRST — so a burst driven
        // in the same turn as the subscribe (what the FX contract suites
        // do) was dropped wholesale as "before the flag spoke". The flag's
        // CURRENT value is therefore read synchronously here, before the
        // first tick can be folded, which is also what the RxJS
        // `conflateWhen` does structurally: its `flag$.pipe(switchMap(…))`
        // subscribes the source only once the flag has emitted, and a
        // replay-current flag emits during `subscribe`. A flag with no
        // current value still seeds `None`, so "before the flag spoke" is
        // unchanged for a genuinely silent flag. The flag stream's own
        // first event re-states the same value a moment later, which is a
        // no-op transition.
        const state = yield* Ref.make<ConflationState<T>>({
          calm: peekCurrent(calm$),
          window: Option.none(),
          pending: Option.none(),
        });

        function emit(value: T): Effect.Effect<void> {
          return update(() => {
            return value;
          });
        }

        // ONE fiber per window, forked from the producer (so the period's end
        // interrupts it) and looping in place: at each window's end it
        // publishes the pending value and sleeps again, or closes when nothing
        // is pending. It must NOT fork the next window itself — a forked child
        // is interrupted when its parent fiber completes, so a timer fiber that
        // forked its successor and then ended would kill it at once.
        function windowLoop(): Effect.Effect<void> {
          return Effect.gen(function* sleepThroughWindows() {
            let open = true;

            while (open) {
              yield* Effect.sleep(Duration.millis(ms));
              const trailing = yield* Ref.modify(
                state,
                (current): [Option.Option<T>, ConflationState<T>] => {
                  return Option.isSome(current.pending)
                    ? [current.pending, { ...current, pending: Option.none() }]
                    : [
                        Option.none(),
                        {
                          ...current,
                          window: Option.none(),
                          pending: Option.none(),
                        },
                      ];
                },
              );

              if (Option.isSome(trailing)) {
                yield* emit(trailing.value);
              } else {
                open = false;
              }
            }
          });
        }

        function openWindow(): Effect.Effect<void> {
          return Effect.fork(windowLoop()).pipe(
            Effect.flatMap((fiber) => {
              return Ref.update(state, (current) => {
                return { ...current, window: Option.some(fiber) };
              });
            }),
          );
        }

        function act(action: ConflationAction<T>): Effect.Effect<void> {
          switch (action.kind) {
            case "none":
              return Effect.void;
            case "emit":
              return emit(action.value);
            case "emitAndOpen":
              return emit(action.value).pipe(Effect.andThen(openWindow()));
            case "interrupt":
              return Fiber.interrupt(action.fiber).pipe(Effect.asVoid);
          }
        }

        function transition(
          current: ConflationState<T>,
          event: ConflationEvent<T>,
        ): [ConflationAction<T>, ConflationState<T>] {
          if (event.kind === "calm") {
            const next: ConflationState<T> = {
              ...current,
              calm: Option.some(event.on),
            };

            if (!event.on && Option.isSome(current.window)) {
              return [
                { kind: "interrupt", fiber: current.window.value },
                { ...next, window: Option.none(), pending: Option.none() },
              ];
            }

            return [{ kind: "none" }, next];
          }

          if (Option.isNone(current.calm)) {
            return [{ kind: "none" }, current];
          }

          if (!current.calm.value) {
            return [{ kind: "emit", value: event.value }, current];
          }

          if (Option.isNone(current.window)) {
            return [{ kind: "emitAndOpen", value: event.value }, current];
          }

          return [
            { kind: "none" },
            { ...current, pending: Option.some(event.value) },
          ];
        }

        const events = Stream.merge(tickEvents, calmEvents);

        yield* Stream.runForEach(events, (event) => {
          return Ref.modify(state, (current) => {
            return transition(current, event);
          }).pipe(Effect.flatMap(act));
        });
      });
    },
  });
}
