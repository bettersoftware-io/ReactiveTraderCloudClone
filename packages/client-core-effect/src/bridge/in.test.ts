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
