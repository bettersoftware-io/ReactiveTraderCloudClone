import { Chunk, Effect, Fiber, Stream } from "effect";
import { BehaviorSubject, concat, EMPTY, of, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { fromObservable, peek, rpc } from "#/bridge/in";

describe("bridge/in", () => {
  it("rpc() succeeds with the first emission", async () => {
    await expect(Effect.runPromise(rpc(of(7, 8)))).resolves.toBe(7);
  });

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
  it("rpc() fails with the source error", async () => {
    const boom = new Error("boom");
    await expect(
      Effect.runPromise(
        rpc(
          throwError(() => {
            return boom;
          }),
        ),
      ),
    ).rejects.toThrow("boom");
  });

  it("rpc() fails when the source completes without a value", async () => {
    await expect(Effect.runPromise(rpc(EMPTY))).rejects.toThrow(
      "rpc: source completed without a value",
    );
  });

  it("rpc() unsubscribes when the caller is interrupted before any value", async () => {
    const source = new Subject<number>();
    const fiber = Effect.runFork(rpc(source));
    await new Promise((resume) => {
      setTimeout(resume, 0);
    });
    expect(source.observed).toBe(true);
    await Effect.runPromise(Fiber.interrupt(fiber));
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
  it("rpc() ignores an error that arrives after it already settled", async () => {
    // A synchronous source keeps pushing THROUGH the `next` that settled us —
    // the unsubscribe in there ran against a holder the `subscribe` call had
    // not assigned yet. The `settled` guard is what stops this erroring a
    // fiber that has already been resumed with 1.
    const source = concat(
      of(1),
      throwError(() => {
        return new Error("late");
      }),
    );
    await expect(Effect.runPromise(rpc(source))).resolves.toBe(1);
  });

  describe("peek", () => {
    it("reads a replay-current source synchronously and leaves nothing warm", () => {
      const source = new BehaviorSubject("a");
      expect(peek(source, "z")).toBe("a");
      expect(source.observed).toBe(false);
    });

    it("returns the fallback for a source that does not emit on subscribe", () => {
      expect(peek(new Subject<string>(), "z")).toBe("z");
    });
  });
});
