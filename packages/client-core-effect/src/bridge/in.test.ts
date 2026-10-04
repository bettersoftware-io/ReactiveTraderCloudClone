import { Chunk, Effect, Exit, Scope, Stream } from "effect";
import { of, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { fromObservable } from "#/bridge/in";

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
});

/** Run the stream and keep each chunk it emits, as plain arrays. */
function collectChunks(stream: Stream.Stream<number, unknown>): number[][] {
  const chunks: number[][] = [];
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
