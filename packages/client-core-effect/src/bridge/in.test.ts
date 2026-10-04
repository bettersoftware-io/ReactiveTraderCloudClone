import { Chunk, Effect, Exit, Scope, Stream } from "effect";
import { BehaviorSubject, of, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import {
  fromObservable,
  fromObservables,
  type PortEvents,
  portEvents,
  releasePorts,
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
