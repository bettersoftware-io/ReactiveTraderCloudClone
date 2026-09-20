import { Effect, Fiber } from "effect";
import { concat, EMPTY, of, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";

import { rpc } from "#/bridge/rpc";

describe("bridge/rpc", () => {
  it("rpc() succeeds with the first emission", async () => {
    await expect(Effect.runPromise(rpc(of(7, 8)))).resolves.toBe(7);
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

  it("rpc() is lazy: nothing is subscribed until the Effect runs", () => {
    const source = new Subject<number>();
    rpc(source);
    expect(source.observed).toBe(false);
  });
});
