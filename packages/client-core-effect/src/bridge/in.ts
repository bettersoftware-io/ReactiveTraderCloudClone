import { Chunk, Effect, Queue, Scope, Stream, Take } from "effect";
import type { Observable, Unsubscribable } from "rxjs";

/** Push an Observable into an Effect Stream, subscribing SYNCHRONOUSLY, as a
 * side effect of calling `fromObservable` itself — not lazily, on first
 * pull, the way the obvious `Stream.asyncPush`/`Stream.asyncScoped` shapes
 * do. Values (and completion/error) are still delivered on the scheduler,
 * same as before; only the act of subscribing moved earlier.
 *
 * MEASURED on effect 3.22.2, with `s$.observed` as the probe: under
 * `runtime.runFork`, a plain `Effect` (`Effect.sync`, `Effect.async`,
 * `Effect.gen`) runs synchronously up to its first suspension — but
 * `Stream.runForEach(stream, f)` does NOT extend that guarantee to
 * anything inside `stream`, for ANY stream shape. Every construction tried
 * deferred by at least one microtask past `runFork`'s return: the original
 * `Stream.asyncPush`, `Stream.asyncScoped`, `Stream.unwrapScoped` (a `Queue`
 * built inside a scoped `Effect.gen`), `Stream.unwrap(Effect.sync(...))` —
 * even the pure, Effect-free `Stream.make(1).pipe(Stream.tap(...))`, whose
 * `tap` never runs synchronously either. `Stream.runForEach`'s own
 * channel-loop scheduling is what introduces the delay, unconditionally —
 * not `fromObservable`'s previous implementation, and not fixable by
 * changing what the stream is built from. (Do not "simplify" this back to
 * `asyncPush`: it measurably reintroduces the bug — see `sharedFold`'s and
 * this file's "…synchronously…" tests.)
 *
 * So this subscribes from PLAIN, synchronous code — the function body,
 * called as an ordinary expression before any `Effect`/`Stream` machinery
 * runs — buffering into a `Queue` that the returned stream merely drains.
 * `sharedFold`'s producers rely on exactly this: `fold.run(update)` (which
 * calls `fromObservable(...)`) is evaluated to build the Effect handed to
 * `runFork`, so the subscribe below has already happened by the time
 * `runFork` is even called, not just by the time it returns.
 *
 * One consequence: this subscribes once per CALL, not once per independent
 * `Stream.runForEach` run of the resulting value — a caller that builds one
 * `fromObservable(source)` stream and drains it to completion more than
 * once will only see the first run's subscription (the second sees an
 * already-unsubscribed source).
 *
 * BURSTS TRAVEL WHOLE. Everything the source emits in one turn is drained
 * together and sent downstream as ONE chunk (`drainBurst` +
 * `joinConsecutiveValues` below). `Stream.merge`, `mergeAll` and `flatMap`
 * hand each CHUNK from one fiber to another as a step of its own, so a burst
 * that enters as fifty single-value chunks (what the obvious
 * `Stream.fromQueue(queue).pipe(Stream.flattenTake)` produces: one chunk per
 * `Take`) costs fifty hand-overs at every merge it crosses.
 *
 * What that has cost, MEASURED 2026-10-04 on the pricing simulator's replay
 * of 50 historical ticks per pair on subscribe (React client, nine tiles):
 *
 * - On Effect's default scheduler every hand-over was a turn of its own, and
 *   a UI renders once per turn: the tiles rendered 1,070 times in their
 *   first two seconds against ~95 on the RxJS and async cores, and start-up
 *   kept the page busy for 666 ms against 166 ms. That is what made the
 *   effect-core e2e job slow, and why this was written.
 * - On the turn scheduler (`bridge/turnScheduler.ts`) the hand-overs all
 *   happen inside one turn, so the RENDERS no longer depend on this — the
 *   contract cases named "…in one turn" pass with the burst split. The WORK
 *   is still saved: start-up is ~40 ms busier with it split (580 ms against
 *   537 ms).
 *
 * So this is a saving of fiber steps now; the one-turn guarantee is the
 * scheduler's. A waiting `take` is handed the burst's first value alone,
 * hence the `takeAll` that follows it. This file's chunk tests pin the
 * joining.
 *
 * The calling rule, stated as what to DO: call it inside a `sharedFold`'s
 * `run`, once per warm period. Never at presenter construction, never
 * hoisted, never reused across periods: the subscription exists from the
 * moment this returns, a stream that is never run leaks it and its
 * unbounded queue, and two concurrent runs of one returned stream split the
 * events between them. The calling rule is now structural: presenters reach
 * this only through a `sharedFold`'s period-scoped `fromPort`
 * (`bridge/out.ts`), which passes the period's scope; the
 * dependency-cruiser rule `effect-port-subscription-owned-by-the-bridge`
 * keeps it that way. */
export function fromObservable<T>(
  source: Observable<T>,
  scope?: Scope.Scope,
): Stream.Stream<T, unknown> {
  return fromObservables(
    [
      portEvents(source, (value: T) => {
        return value;
      }),
    ],
    scope,
  );
}

/** One source of a merged stream: a port, and what each of its values
 * becomes there (`portEvents`). */
export interface PortEvents<E> {
  /** Subscribe the port, handing every value to `sink` as an event. */
  readonly subscribe: (sink: EventSink<E>) => Unsubscribable;
}

/** Where a merged stream's sources put what they emit. */
interface EventSink<E> {
  emit(event: E): void;
  fail(error: unknown): void;
  end(): void;
}

/** A port as a source of a merged stream: `toEvent` turns each value into
 * the stream's event type — usually by tagging it with which port it came
 * from. It runs in the port's own emission, so it must not throw. */
export function portEvents<A, E>(
  source: Observable<A>,
  toEvent: (value: A) => E,
): PortEvents<E> {
  return {
    subscribe: (sink: EventSink<E>) => {
      return source.subscribe({
        next: (value: A) => {
          sink.emit(toEvent(value));
        },
        error: (error: unknown) => {
          sink.fail(error);
        },
        complete: () => {
          sink.end();
        },
      });
    },
  };
}

/** A port's FIRST value as a source of a merged stream, then its end: the
 * one-shot query shape (`rpc`, as plain subscription management). The port
 * is released as soon as it has answered. One that completes without a
 * value fails the stream, as `rpc` does. */
export function firstPortEvent<A, E>(
  source: Observable<A>,
  toEvent: (value: A) => E,
): PortEvents<E> {
  return {
    subscribe: (sink: EventSink<E>) => {
      let subscription: Unsubscribable | undefined;
      let settled = false;

      // A synchronous source answers DURING `subscribe`, before the holder
      // below is assigned: the release then happens after it returns.
      function settle(): void {
        settled = true;
        subscription?.unsubscribe();
      }

      subscription = source.subscribe({
        next: (value: A) => {
          if (!settled) {
            settle();
            sink.emit(toEvent(value));
            sink.end();
          }
        },
        error: (error: unknown) => {
          if (!settled) {
            settle();
            sink.fail(error);
          }
        },
        complete: () => {
          if (!settled) {
            settle();
            sink.fail(
              new Error("firstPortEvent: source completed without a value"),
            );
          }
        },
      });

      if (settled) {
        subscription.unsubscribe();
      }

      return {
        unsubscribe: settle,
      };
    },
  };
}

/** One event, then the end: the constant member of a group (the RxJS
 * `of(event)`). */
export function oneEvent<E>(event: E): PortEvents<E> {
  return {
    subscribe: (sink: EventSink<E>) => {
      sink.emit(event);
      sink.end();

      return {
        unsubscribe: () => {},
      };
    },
  };
}

/** The LATEST event of every member, as one source of a merged stream: an
 * array in the members' order, emitted each time one of them emits, from the
 * moment every member has emitted once — the RxJS `combineLatest`, as plain
 * subscription management.
 *
 * It ends when every member has ended and fails as soon as one does. No
 * members at all is an immediate end, as `combineLatest([])` is.
 *
 * Why not `Stream.zipLatestAll` over a stream per port: a fiber per port and
 * a hand-over per value, as `Stream.merge` (see `fromObservables`). */
export function latestOfEach<E>(
  members: readonly PortEvents<E>[],
): PortEvents<readonly E[]> {
  return {
    subscribe: (sink: EventSink<readonly E[]>) => {
      const latest: E[] = [];
      const seen = members.map(() => {
        return false;
      });
      let missing = members.length;
      let live = members.length;

      if (members.length === 0) {
        sink.end();
      }

      const subscriptions = members.map((member, index) => {
        return member.subscribe({
          emit: (event: E) => {
            latest[index] = event;

            if (!seen[index]) {
              seen[index] = true;
              missing -= 1;
            }

            if (missing === 0) {
              sink.emit([...latest]);
            }
          },
          fail: (error: unknown) => {
            sink.fail(error);
          },
          end: () => {
            live -= 1;

            if (live === 0) {
              sink.end();
            }
          },
        });
      });

      return {
        unsubscribe: () => {
          for (const each of subscriptions) {
            each.unsubscribe();
          }
        },
      };
    },
  };
}

/** A GROUP of ports that follows a selector, as one source of a merged
 * stream: the ports `open` returns for the selector's LATEST value. A new
 * value releases the previous group's ports, then opens the next group —
 * the RxJS `selector$.pipe(switchMap((key) => merge(...open(key))))`, done
 * as plain subscription management so every member feeds the merged
 * stream's one queue.
 *
 * `open` runs once per selector value, so state it closes over is fresh per
 * group: a "previous value" kept there starts empty after every switch (the
 * RxJS `pairwise` inside a `switchMap`).
 *
 * A member that completes leaves its group; one that fails fails the whole
 * stream (wrap it in `leavingOnFailure` to make it leave instead). The
 * source ends when the selector has completed and its last group has no
 * member left.
 *
 * Why not `Stream.flatMap(…, { switch: true })` over `Stream.mergeAll` of a
 * stream per port: that is a fiber per port and a hand-over per value at
 * each merge. MEASURED 2026-10-05 (React client, nine FX pairs, 6 s of
 * steady state): the animation director and the Jarvis narrator, each
 * following the roster's prices that way, ran 812 of the core's 1,143
 * scheduler tasks — four and three per tick. */
export function switchedPortEvents<K, E>(
  selector: Observable<K>,
  open: (key: K) => readonly PortEvents<E>[],
): PortEvents<E> {
  return {
    subscribe: (sink: EventSink<E>) => {
      let group: readonly Unsubscribable[] = [];
      let groupNumber = 0;
      let liveMembers = 0;
      let selectorEnded = false;

      function releaseGroup(): void {
        const released = group;
        group = [];
        liveMembers = 0;

        for (const member of released) {
          member.unsubscribe();
        }
      }

      function endWhenDone(): void {
        if (selectorEnded && liveMembers === 0) {
          sink.end();
        }
      }

      const selection = selector.subscribe({
        next: (key: K) => {
          releaseGroup();
          groupNumber += 1;
          const mine = groupNumber;
          const members = open(key);
          liveMembers = members.length;
          const opened = members.map((member) => {
            return member.subscribe({
              emit: (event: E) => {
                sink.emit(event);
              },
              fail: (error: unknown) => {
                sink.fail(error);
              },
              end: () => {
                liveMembers -= 1;
                endWhenDone();
              },
            });
          });

          // A member that made the selector emit again while this group was
          // still opening: the newer group is the live one, this one goes.
          if (mine === groupNumber) {
            group = opened;
            return;
          }

          for (const member of opened) {
            member.unsubscribe();
          }
        },
        error: (error: unknown) => {
          releaseGroup();
          sink.fail(error);
        },
        complete: () => {
          selectorEnded = true;
          endWhenDone();
        },
      });

      return {
        unsubscribe: () => {
          selection.unsubscribe();
          releaseGroup();
        },
      };
    },
  };
}

/** `source`, leaving quietly when it fails: its failure becomes its end.
 * For a member of a group whose others must carry on (the narrator: one
 * pair's failing price stream silences that pair until the next roster). */
export function leavingOnFailure<E>(source: PortEvents<E>): PortEvents<E> {
  return {
    subscribe: (sink: EventSink<E>) => {
      return source.subscribe({
        emit: (event: E) => {
          sink.emit(event);
        },
        fail: () => {
          sink.end();
        },
        end: () => {
          sink.end();
        },
      });
    },
  };
}

/** Several ports as ONE stream: `fromObservable` for more than one source,
 * all feeding the same queue. Everything `fromObservable` says holds — the
 * ports are subscribed synchronously, in the order given, as a side effect
 * of this call; a burst travels as one chunk — and two things besides:
 *
 * - Events arrive in the order the ports emitted them, across ports.
 *   `Stream.merge` promises no order between its sides (measured: it drained
 *   one side first, so a fold had to read a flag's current value on the side
 *   to avoid dropping the ticks that arrived "before" it).
 * - It costs one fiber step per burst, not about eleven per value.
 *   `Stream.merge` runs each side on a fiber of its own and hands every
 *   chunk across. MEASURED 2026-10-04 (React client, FX screen, 6 s of
 *   steady state): the price and price-history folds and the stale-flag
 *   machines, each a `Stream.merge` of two ports, ran 4,250 scheduler tasks;
 *   merged here instead, 600.
 *
 * The stream ends when EVERY port has completed, and fails as soon as one
 * does, after the events that came before the failure. */
export function fromObservables<E>(
  sources: readonly PortEvents<E>[],
  scope?: Scope.Scope,
): Stream.Stream<E, unknown> {
  const queue = Effect.runSync(Queue.unbounded<Take.Take<E, unknown>>());
  let live = sources.length;
  const sink: EventSink<E> = {
    emit: (event: E) => {
      Queue.unsafeOffer(queue, Take.of(event));
    },
    fail: (error: unknown) => {
      Queue.unsafeOffer(queue, Take.fail(error));
    },
    end: () => {
      live -= 1;

      if (live === 0) {
        Queue.unsafeOffer(queue, Take.end);
      }
    },
  };

  const subscriptions = sources.map((source) => {
    return source.subscribe(sink);
  });

  const subscription: Unsubscribable = {
    unsubscribe: () => {
      for (const each of subscriptions) {
        each.unsubscribe();
      }
    },
  };

  // A stream that is never run never reaches its `ensuring` — so the period
  // that opened this subscription also owns it: closing the scope releases
  // it whether or not the stream ran. `unsubscribe` is idempotent. The
  // finalizer lives as long as the scope, so a caller calls this once per
  // source per scope — one per event would accumulate a subscription and a
  // finalizer per value until the scope closes.
  if (scope !== undefined) {
    Effect.runSync(
      Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          subscription.unsubscribe();
        }),
      ),
    );
    holdForSynchronousRelease(scope, subscription);
  }

  // One drain = everything the source emitted in one turn. A parked `take`
  // is handed the burst's FIRST value alone (the queue completes a waiting
  // taker with one element), so the rest is collected with `takeAll` once
  // this fiber resumes — by then the source's synchronous loop has finished
  // and the whole burst is queued.
  const drainBurst = Queue.take(queue).pipe(
    Effect.zipWith(Queue.takeAll(queue), (first, rest) => {
      return Chunk.prepend(rest, first);
    }),
  );

  return Stream.repeatEffectChunk(drainBurst).pipe(
    Stream.mapChunks(joinConsecutiveValues),
    Stream.flattenTake,
    Stream.ensuring(
      Effect.sync(() => {
        subscription.unsubscribe();
      }),
    ),
  );
}

/** The port subscriptions each scope owns, so `releasePorts` can end them
 * without running the scope's finalizers. Weak: an entry goes with its scope. */
const portsOf = new WeakMap<Scope.Scope, Set<Unsubscribable>>();

function holdForSynchronousRelease(
  scope: Scope.Scope,
  subscription: Unsubscribable,
): void {
  const held = portsOf.get(scope);

  if (held === undefined) {
    portsOf.set(scope, new Set([subscription]));
    return;
  }

  held.add(subscription);
}

/** Unsubscribe, NOW, every port `fromObservable` subscribed for `scope` —
 * what an RxJS `unsubscribe()` does, and what closing the scope does not.
 *
 * `Scope.close` is an effect: it interrupts the fibers forked into the scope
 * one at a time, newest first, WAITING for each to end before it turns to
 * the next, and only then runs the finalizers that unsubscribe the ports. So
 * for several fiber steps after a `dispose()` returns, the ports are still
 * subscribed and the fold fiber is still running: an event emitted in that
 * window is received and folded.
 *
 * MEASURED 2026-10-04, when each `state$` subscriber still had a fiber of
 * its own in the machine's scope: a stale-flag machine whose `state$` had
 * just been unsubscribed (that fiber was the newest in the scope, so the
 * close waited on it first) folded two connection events emitted after
 * `dispose()`. It had passed until then only because `Stream.merge` took
 * longer to carry an event than the close took to reach the fold fiber. Released here, an
 * event emitted after the close began is never received at all. */
export function releasePorts(scope: Scope.Scope): void {
  const held = portsOf.get(scope);

  if (held === undefined) {
    return;
  }

  portsOf.delete(scope);

  for (const subscription of held) {
    subscription.unsubscribe();
  }
}

/** Everything the queue held at one drain, with each run of consecutive
 * values joined into ONE `Take` — so a burst the source emitted in a single
 * turn travels downstream as a single chunk. A terminal `Take` (end or
 * failure) stays where it was, after the values that preceded it. */
function joinConsecutiveValues<T>(
  takes: Chunk.Chunk<Take.Take<T, unknown>>,
): Chunk.Chunk<Take.Take<T, unknown>> {
  const joined: Take.Take<T, unknown>[] = [];
  let values: T[] = [];

  function flushValues(): void {
    if (values.length > 0) {
      joined.push(Take.chunk(Chunk.unsafeFromArray(values)));
      values = [];
    }
  }

  for (const take of takes) {
    Take.match(take, {
      onEnd: () => {
        flushValues();
        joined.push(take);
      },
      onFailure: () => {
        flushValues();
        joined.push(take);
      },
      onSuccess: (chunk: Chunk.Chunk<T>) => {
        values.push(...chunk);
      },
    });
  }

  flushValues();
  return Chunk.unsafeFromArray(joined);
}
