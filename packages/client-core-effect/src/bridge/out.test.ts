import { Effect, Layer, ManagedRuntime, Stream, SubscriptionRef } from "effect";
import { describe, expect, it } from "vitest";

import { refToStateStream, streamToStream } from "#/bridge/out";

describe("bridge/out", () => {
  const runtime = ManagedRuntime.make(Layer.empty);

  it("streamToStream() forwards emissions and completes", async () => {
    const seen: number[] = [];
    await new Promise<void>((resolve) => {
      streamToStream(runtime, Stream.make(1, 2, 3)).subscribe({
        next: (v: number) => {
          seen.push(v);
        },
        complete: resolve,
      });
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("streamToStream() interrupts the fiber on unsubscribe", async () => {
    let interrupted = false;
    const never = Stream.fromEffect(
      Effect.never.pipe(
        Effect.onInterrupt(() => {
          return Effect.sync(() => {
            interrupted = true;
          });
        }),
      ),
    );
    const sub = streamToStream(runtime, never).subscribe(() => {});
    sub.unsubscribe();
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(interrupted).toBe(true);
  });

  it("refToStateStream() carries the current value synchronously, then changes", async () => {
    const ref = await runtime.runPromise(SubscriptionRef.make(5));
    const seen: number[] = [];
    const sub = refToStateStream(runtime, ref).subscribe((v) => {
      seen.push(v);
    });
    expect(seen).toEqual([5]);
    await runtime.runPromise(SubscriptionRef.set(ref, 6));
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(seen).toEqual([5, 6]);
    sub.unsubscribe();
  });
  it("streamToStream() surfaces a stream failure as an Observable error", async () => {
    const boom = new Error("boom");
    const failure = await new Promise<unknown>((resolve) => {
      streamToStream(runtime, Stream.fail(boom)).subscribe({
        error: resolve,
      });
    });
    expect(failure).toBe(boom);
  });
  it("streamToStream() keeps an interrupt-only cause silent", async () => {
    let errored = false;
    let completed = false;
    streamToStream(runtime, Stream.fromEffect(Effect.interrupt)).subscribe({
      error: () => {
        errored = true;
      },
      complete: () => {
        completed = true;
      },
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(errored).toBe(false);
    expect(completed).toBe(false);
  });
});
