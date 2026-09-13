import { Chunk, Effect, Fiber, Stream } from "effect";
import { concat, EMPTY, of, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { fromObservable, rpc } from "#/bridge/in";

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

  it("fromObservable() unsubscribes from the source when the consumer stops", async () => {
    const source = new Subject<number>();
    const program = Stream.runCollect(Stream.take(fromObservable(source), 1));
    const fiber = Effect.runFork(program);
    // `runFork` returns BEFORE the fiber reaches asyncPush's register effect,
    // so `source.observed` is still false here. A hot Subject drops anything
    // emitted now and `take(1)` would never complete — yield a macrotask
    // first so the emission has a subscriber to land on.
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
});
