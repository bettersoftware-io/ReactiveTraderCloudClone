import { Chunk, Effect, Exit, Scope, Stream } from "effect";
import {
  BehaviorSubject,
  of,
  Subject,
  throwError,
  type Unsubscribable,
} from "rxjs";
import { describe, expect, it } from "vitest";

import {
  firstPortEvent,
  fromObservable,
  fromObservables,
  latestOfEach,
  leavingOnFailure,
  oneEvent,
  type PortEvents,
  portEvents,
  releasePorts,
  switchedPortEvents,
} from "#/bridge/in";

describe("bridge/in", () => {
  it("fromObservable() yields values in order and ends on completion", async () => {
    const values = await Effect.runPromise(
      Stream.runCollect(fromObservable(of(1, 2, 3))),
    );
    expect(Chunk.toArray(values)).toEqual([1, 2, 3]);
  });

  it("fromObservable() subscribes the source synchronously under runFork", async () => {
    const subject = new Subject<number>();
    const seen: number[] = [];
    Effect.runFork(
      Stream.runForEach(fromObservable(subject), (v) => {
        return Effect.sync(() => {
          seen.push(v);
        });
      }),
    );
    // No await: the rxjs subscription itself must already exist by the time
    // `runFork` returns control — `fromObservable` subscribes as a plain,
    // synchronous side effect of being CALLED (see its docstring for why:
    // `Stream.runForEach`'s own channel-loop machinery defers even the
    // simplest internal step by ≥1 microtask under `runFork`, regardless of
    // what the stream is built from, so the subscribe cannot live inside it).
    expect(subject.observed).toBe(true);
    subject.next(1);
    await new Promise((resume) => {
      setTimeout(resume, 0);
    });
    expect(seen).toEqual([1]);
  });

  it("fromObservable() unsubscribes from the source when the consumer stops", async () => {
    const source = new Subject<number>();
    const program = Stream.runCollect(Stream.take(fromObservable(source), 1));
    const fiber = Effect.runFork(program);
    // The subscription itself is already live here (synchronous with
    // `runFork`, see the test above) — this wait is for VALUE delivery only:
    // `Stream.runForEach`'s channel-loop pull is still a scheduled step, so
    // `take(1)`'s consumer isn't listening on the queue yet. A value emitted
    // now is buffered (not dropped) either way; the wait just keeps this
    // test's shape aligned with the "on the scheduler is fine" contract.
    await new Promise((resume) => {
      setTimeout(resume, 0);
    });
    source.next(1);
    await Effect.runPromise(Effect.fromFiber(fiber));
    expect(source.observed).toBe(false);
  });

  it("fromObservable() fails the stream with the source error", async () => {
    const boom = new Error("boom");
    await expect(
      Effect.runPromise(
        Stream.runCollect(
          fromObservable(
            throwError(() => {
              return boom;
            }),
          ),
        ),
      ),
    ).rejects.toThrow("boom");
  });

  it("fromObservable() carries a burst the source emits in one turn as ONE chunk — before the stream first runs, and again while it is already waiting", async () => {
    const source = new Subject<number>();
    const chunks = collectChunks(fromObservable(source));
    source.next(1);
    source.next(2);
    source.next(3);
    await nextMacrotask();
    source.next(4);
    source.next(5);
    source.next(6);
    await nextMacrotask();
    expect(chunks).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it("fromObservable() keeps values from separate turns in separate chunks — nothing is held back to wait for more", async () => {
    const source = new Subject<number>();
    const chunks = collectChunks(fromObservable(source));
    source.next(1);
    await nextMacrotask();
    source.next(2);
    await nextMacrotask();
    expect(chunks).toEqual([[1], [2]]);
  });

  it("fromObservable() delivers the values that preceded an error in the same turn, then fails", async () => {
    const source = new Subject<number>();
    const seen: number[] = [];
    const outcome = Effect.runPromise(
      Stream.runForEach(fromObservable(source), (value) => {
        return Effect.sync(() => {
          seen.push(value);
        });
      }),
    );
    source.next(1);
    source.next(2);
    source.error(new Error("boom"));
    await expect(outcome).rejects.toThrow("boom");
    expect(seen).toEqual([1, 2]);
  });

  it("fromObservable() delivers the values that preceded completion in the same turn, then ends", async () => {
    const source = new Subject<number>();
    const chunks = collectChunks(fromObservable(source));
    source.next(1);
    source.next(2);
    source.complete();
    await nextMacrotask();
    source.next(3);
    await nextMacrotask();
    expect(chunks).toEqual([[1, 2]]);
  });

  it("fromObservable(source, scope) releases the source when the scope closes even if the stream was never run", async () => {
    const source = new Subject<number>();
    const scope = Effect.runSync(Scope.make());
    // Built, never run: only the scope's finalizer can release it.
    fromObservable(source, scope);
    expect(source.observed).toBe(true);
    await Effect.runPromise(Scope.close(scope, Exit.void));
    expect(source.observed).toBe(false);
  });

  it("fromObservables() delivers the ports' events in the order they were emitted, across ports, as one chunk per turn", async () => {
    const letters = new Subject<string>();
    const numbers = new Subject<number>();
    const chunks = collectChunks(
      fromObservables<string>([
        portEvents(letters, (letter: string) => {
          return `letter ${letter}`;
        }),
        portEvents(numbers, (value: number) => {
          return `number ${value}`;
        }),
      ]),
    );
    await nextMacrotask();

    letters.next("a");
    numbers.next(1);
    letters.next("b");
    await nextMacrotask();
    numbers.next(2);
    await nextMacrotask();

    expect(chunks).toEqual([
      ["letter a", "number 1", "letter b"],
      ["number 2"],
    ]);
  });

  it("fromObservables() subscribes the ports synchronously and in the order given — what an earlier port replays on subscribe is queued ahead of a later port's", async () => {
    const flag = new BehaviorSubject("flag");
    const chunks = collectChunks(
      fromObservables<string>([
        portEvents(flag, (value: string) => {
          return value;
        }),
        portEvents(of("first", "second"), (value: string) => {
          return value;
        }),
      ]),
    );
    expect(flag.observed).toBe(true);
    await nextMacrotask();
    expect(chunks).toEqual([["flag", "first", "second"]]);
  });

  it("fromObservables() ends only when every port has completed", async () => {
    const first = new Subject<number>();
    const second = new Subject<number>();
    let ended = false;
    Effect.runFork(
      Stream.runDrain(fromObservables([asIs(first), asIs(second)])).pipe(
        Effect.andThen(
          Effect.sync(() => {
            ended = true;
          }),
        ),
      ),
    );
    await nextMacrotask();
    first.complete();
    await nextMacrotask();
    expect(ended).toBe(false);
    second.complete();
    await nextMacrotask();
    expect(ended).toBe(true);
  });

  it("fromObservables() fails as soon as one port fails, after the events before it, and releases the other ports", async () => {
    const healthy = new Subject<number>();
    const failing = new Subject<number>();
    const seen: number[] = [];
    const exit = Effect.runPromiseExit(
      Stream.runForEach(
        fromObservables([asIs(healthy), asIs(failing)]),
        (value) => {
          return Effect.sync(() => {
            seen.push(value);
          });
        },
      ),
    );
    await nextMacrotask();
    healthy.next(1);
    failing.next(2);
    failing.error(new Error("port"));
    expect(Exit.isFailure(await exit)).toBe(true);
    expect(seen).toEqual([1, 2]);
    expect(healthy.observed).toBe(false);
  });

  it("fromObservables(sources, scope) ties every port to the scope: closing it, or releasePorts, releases them all", async () => {
    const first = new Subject<number>();
    const second = new Subject<number>();
    const scope = Effect.runSync(Scope.make());
    fromObservables([asIs(first), asIs(second)], scope);
    expect(first.observed).toBe(true);
    expect(second.observed).toBe(true);
    releasePorts(scope);
    expect(first.observed).toBe(false);
    expect(second.observed).toBe(false);

    const third = new Subject<number>();
    const fourth = new Subject<number>();
    const closing = Effect.runSync(Scope.make());
    fromObservables([asIs(third), asIs(fourth)], closing);
    await Effect.runPromise(Scope.close(closing, Exit.void));
    expect(third.observed).toBe(false);
    expect(fourth.observed).toBe(false);
  });

  it("switchedPortEvents() carries the latest group's ports and releases the previous group's when the selector moves on", () => {
    const selector = new Subject<string>();
    const ports = { a: new Subject<number>(), b: new Subject<number>() };
    const heard = listenTo(
      switchedPortEvents(selector, (key: string) => {
        return key === "a" ? [asIs(ports.a)] : [asIs(ports.b)];
      }),
    );
    expect(ports.a.observed).toBe(false);

    selector.next("a");
    ports.a.next(1);
    selector.next("b");
    expect(ports.a.observed).toBe(false);
    ports.a.next(2);
    ports.b.next(3);

    expect(heard.log).toEqual(["emit 1", "emit 3"]);
    heard.subscription.unsubscribe();
  });

  it("switchedPortEvents() opens each group afresh — state the group closes over does not carry across a switch", () => {
    const selector = new Subject<string>();
    const port = new Subject<number>();
    const heard = listenTo(
      switchedPortEvents(selector, () => {
        let seen = 0;

        return [
          portEvents(port, (value: number) => {
            seen += 1;
            return value * 10 + seen;
          }),
        ];
      }),
    );

    selector.next("first");
    port.next(1);
    port.next(2);
    selector.next("second");
    port.next(3);

    expect(heard.log).toEqual(["emit 11", "emit 22", "emit 31"]);
    heard.subscription.unsubscribe();
  });

  it("switchedPortEvents() a member that fails fails the source; under leavingOnFailure it only leaves, and the others carry on", () => {
    const selector = new Subject<boolean>();
    const failing = new Subject<number>();
    const healthy = new Subject<number>();
    const heard = listenTo(
      switchedPortEvents(selector, (lenient: boolean) => {
        return [
          lenient ? leavingOnFailure(asIs(failing)) : asIs(failing),
          asIs(healthy),
        ];
      }),
    );

    selector.next(true);
    failing.error(new Error("pair"));
    healthy.next(1);
    expect(heard.log).toEqual(["emit 1"]);

    const strict = new Subject<number>();
    const heardStrict = listenTo(
      switchedPortEvents(selector, () => {
        return [asIs(strict), asIs(healthy)];
      }),
    );
    selector.next(false);
    strict.error(new Error("pair"));
    expect(heardStrict.log).toEqual(["fail pair"]);
    heard.subscription.unsubscribe();
    heardStrict.subscription.unsubscribe();
  });

  it("switchedPortEvents() ends once the selector has completed AND its last group has no member left — whichever comes last", () => {
    const selector = new Subject<string>();
    const member = new Subject<number>();
    const heard = listenTo(
      switchedPortEvents(selector, () => {
        return [asIs(member)];
      }),
    );
    selector.next("only");
    selector.complete();
    expect(heard.log).toEqual([]);
    member.next(1);
    member.complete();
    expect(heard.log).toEqual(["emit 1", "end"]);

    const laterSelector = new Subject<string>();
    const earlyMember = new Subject<number>();
    const heardLater = listenTo(
      switchedPortEvents(laterSelector, () => {
        return [asIs(earlyMember)];
      }),
    );
    laterSelector.next("only");
    earlyMember.complete();
    expect(heardLater.log).toEqual([]);
    laterSelector.complete();
    expect(heardLater.log).toEqual(["end"]);
  });

  it("switchedPortEvents() releases the selector and the live group when it is unsubscribed", () => {
    const selector = new BehaviorSubject("only");
    const port = new Subject<number>();
    const heard = listenTo(
      switchedPortEvents(selector, () => {
        return [asIs(port)];
      }),
    );
    expect(selector.observed).toBe(true);
    expect(port.observed).toBe(true);

    heard.subscription.unsubscribe();
    expect(selector.observed).toBe(false);
    expect(port.observed).toBe(false);
  });

  it("switchedPortEvents() a member that makes the selector emit while its group is still opening leaves the NEWER group live", () => {
    const selector = new Subject<string>();
    const ports = {
      first: new Subject<number>(),
      second: new Subject<number>(),
    };

    const switchesOnSubscribe: PortEvents<number> = {
      subscribe: (sink: NumberSink) => {
        const inner = asIs(ports.first).subscribe(sink);
        selector.next("second");
        return inner;
      },
    };

    const heard = listenTo(
      switchedPortEvents(selector, (key: string) => {
        return key === "first" ? [switchesOnSubscribe] : [asIs(ports.second)];
      }),
    );

    selector.next("first");
    expect(ports.first.observed).toBe(false);
    expect(ports.second.observed).toBe(true);
    ports.second.next(7);
    expect(heard.log).toEqual(["emit 7"]);
    heard.subscription.unsubscribe();
    expect(ports.second.observed).toBe(false);
  });

  it("fromObservables() takes a switched group like any other source: its events and a plain port's share one chunk, in emission order", async () => {
    const selector = new BehaviorSubject("only");
    const member = new Subject<number>();
    const plain = new Subject<number>();
    const chunks = collectChunks(
      fromObservables([
        switchedPortEvents(selector, () => {
          return [asIs(member)];
        }),
        asIs(plain),
      ]),
    );
    await nextMacrotask();
    member.next(1);
    plain.next(2);
    member.next(3);
    await nextMacrotask();
    expect(chunks).toEqual([[1, 2, 3]]);
  });

  it("firstPortEvent() emits the port's first value, ends, and releases the port — later values are not heard", () => {
    const source = new Subject<number>();
    const heard = listenTo(firstPortEvent(source, double));

    expect(source.observed).toBe(true);
    source.next(1);
    expect(source.observed).toBe(false);
    source.next(2);

    expect(heard.log).toEqual(["emit 2", "end"]);
  });

  it("firstPortEvent() takes one value from a port that answers during subscribe, and no more", () => {
    const heard = listenTo(firstPortEvent(of(1, 2, 3), double));

    expect(heard.log).toEqual(["emit 2", "end"]);
  });

  it("firstPortEvent() fails with the port's error, and fails when the port completes without a value", () => {
    const failing = listenTo(
      firstPortEvent(
        throwError(() => {
          return new Error("boom");
        }),
        double,
      ),
    );
    const silent = new Subject<number>();
    const empty = listenTo(firstPortEvent(silent, double));
    silent.complete();

    expect(failing.log).toEqual(["fail boom"]);
    expect(empty.log).toEqual([
      "fail firstPortEvent: source completed without a value",
    ]);
  });

  it("firstPortEvent() releases the port when it is unsubscribed before the answer, and says nothing after", () => {
    const source = new Subject<number>();
    const heard = listenTo(firstPortEvent(source, double));

    heard.subscription.unsubscribe();
    expect(source.observed).toBe(false);
    source.next(1);

    expect(heard.log).toEqual([]);
  });

  it("oneEvent() emits its event and ends", () => {
    const heard = listenTo(oneEvent(null));

    expect(heard.log).toEqual(["emit null", "end"]);
  });

  it("latestOfEach() emits the latest of every member, in the members' order, once each has emitted — then on every emission", () => {
    const first = new Subject<number>();
    const second = new Subject<number>();
    const heard = listenTo(
      latestOfEach([portEvents(first, double), portEvents(second, double)]),
    );

    first.next(1);
    first.next(2);
    expect(heard.log).toEqual([]);
    second.next(10);
    first.next(3);

    expect(heard.log).toEqual(["emit [4,20]", "emit [6,20]"]);
  });

  it("latestOfEach() hands out a fresh array each time — a reader that keeps one does not see it change", () => {
    const first = new BehaviorSubject(1);
    const second = new BehaviorSubject(2);
    const kept: (readonly number[])[] = [];
    latestOfEach([
      portEvents(first, double),
      portEvents(second, double),
    ]).subscribe({
      emit: (latest: readonly number[]) => {
        kept.push(latest);
      },
      fail: () => {},
      end: () => {},
    });

    first.next(5);

    expect(kept).toEqual([
      [2, 4],
      [10, 4],
    ]);
  });

  it("latestOfEach() ends when every member has ended, fails as soon as one fails, and ends at once with no members", () => {
    const first = new Subject<number>();
    const second = new Subject<number>();
    const ending = listenTo(
      latestOfEach([portEvents(first, double), portEvents(second, double)]),
    );
    first.complete();
    expect(ending.log).toEqual([]);
    second.complete();

    const third = new Subject<number>();
    const failing = listenTo(
      latestOfEach([portEvents(third, double), portEvents(of(1), double)]),
    );
    third.error(new Error("boom"));

    expect(ending.log).toEqual(["end"]);
    expect(failing.log).toEqual(["fail boom"]);
    expect(listenTo(latestOfEach<number>([])).log).toEqual(["end"]);
  });

  it("latestOfEach() releases every member when it is unsubscribed", () => {
    const first = new Subject<number>();
    const second = new Subject<number>();
    const heard = listenTo(
      latestOfEach([portEvents(first, double), portEvents(second, double)]),
    );

    heard.subscription.unsubscribe();

    expect(first.observed).toBe(false);
    expect(second.observed).toBe(false);
  });

  it("releasePorts() unsubscribes every port of the scope before it returns, and leaves another scope's alone", () => {
    const first = new Subject<number>();
    const second = new Subject<number>();
    const other = new Subject<number>();
    const scope = Effect.runSync(Scope.make());
    const otherScope = Effect.runSync(Scope.make());
    fromObservable(first, scope);
    fromObservable(second, scope);
    fromObservable(other, otherScope);

    releasePorts(scope);

    // No await: the scope itself is still open, its finalizers have not run.
    expect(first.observed).toBe(false);
    expect(second.observed).toBe(false);
    expect(other.observed).toBe(true);
    releasePorts(otherScope);
  });

  it("releasePorts() is a no-op for a scope that owns no port, and when called again", () => {
    const source = new Subject<number>();
    const scope = Effect.runSync(Scope.make());
    releasePorts(scope);
    fromObservable(source, scope);
    releasePorts(scope);
    releasePorts(scope);
    expect(source.observed).toBe(false);
  });
});

/** A port whose values are the merged stream's events unchanged. */
function asIs(source: Subject<number>): PortEvents<number> {
  return portEvents(source, (value: number) => {
    return value;
  });
}

type NumberSink = Parameters<PortEvents<number>["subscribe"]>[0];

/** What a hand-subscribed source said, and the handle to release it. */
interface Heard {
  log: string[];
  subscription: Unsubscribable;
}

function double(value: number): number {
  return value * 2;
}

/** Subscribe a merged-stream source by hand and log what it tells its
 * sink — no stream, no fiber, so every assertion is synchronous. */
function listenTo<E>(source: PortEvents<E>): Heard {
  const log: string[] = [];
  const subscription = source.subscribe({
    emit: (event: E) => {
      log.push(`emit ${JSON.stringify(event)}`);
    },
    fail: (error: unknown) => {
      log.push(
        `fail ${error instanceof Error ? error.message : String(error)}`,
      );
    },
    end: () => {
      log.push("end");
    },
  });
  return { log, subscription };
}

/** Run the stream and keep each chunk it emits, as plain arrays. */
function collectChunks<T>(stream: Stream.Stream<T, unknown>): T[][] {
  const chunks: T[][] = [];
  Effect.runFork(
    Stream.runForEachChunk(stream, (chunk) => {
      return Effect.sync(() => {
        chunks.push(Chunk.toArray(chunk));
      });
    }),
  );
  return chunks;
}

function nextMacrotask(): Promise<void> {
  return new Promise((resume) => {
    setTimeout(resume, 0);
  });
}
