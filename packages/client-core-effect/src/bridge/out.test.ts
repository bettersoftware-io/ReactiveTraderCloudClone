import {
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Scope,
  Stream,
  SubscriptionRef,
} from "effect";
import { afterEach, describe, expect, it } from "vitest";

import {
  type EffectHost,
  refToStateStream,
  streamToStream,
} from "#/bridge/out";

describe("bridge/out", () => {
  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host = makeHost();
    hosts.push(host);
    return host;
  }

  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await closeHost(host);
      }
    }
  });

  it("streamToStream() forwards emissions and completes", async () => {
    const seen: number[] = [];
    await new Promise<void>((resolve) => {
      streamToStream(useHost(), Stream.make(1, 2, 3)).subscribe({
        next: (v: number) => {
          seen.push(v);
        },
        complete: resolve,
      });
    });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("streamToStream() interrupts the fiber on unsubscribe", async () => {
    const { stream, wasInterrupted } = makeNeverStream();
    const sub = streamToStream(useHost(), stream).subscribe(() => {});
    // Let the fiber actually start: `runFork` returns before the stream is
    // running, and an interrupt delivered before `Effect.never` is reached
    // unwinds a fiber that has not yet registered `onInterrupt`.
    await tick();
    sub.unsubscribe();
    await tick();
    expect(wasInterrupted()).toBe(true);
  });

  it("streamToStream() surfaces a stream failure as an Observable error", async () => {
    const boom = new Error("boom");
    const failure = await new Promise<unknown>((resolve) => {
      streamToStream(useHost(), Stream.fail(boom)).subscribe({
        error: resolve,
      });
    });
    expect(failure).toBe(boom);
  });

  it("streamToStream() keeps an interrupt-only cause silent", async () => {
    let errored = false;
    let completed = false;
    streamToStream(useHost(), Stream.fromEffect(Effect.interrupt)).subscribe({
      error: () => {
        errored = true;
      },
      complete: () => {
        completed = true;
      },
    });
    await tick();
    expect(errored).toBe(false);
    expect(completed).toBe(false);
  });

  it("streamToStream() fibers are interrupted when the host scope closes", async () => {
    const host = makeHost();
    const { stream, wasInterrupted } = makeNeverStream();
    streamToStream(host, stream).subscribe(() => {});
    await tick();
    expect(wasInterrupted()).toBe(false);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(wasInterrupted()).toBe(true);
    await host.runtime.dispose();
  });

  it("streamToStream() unsubscribe still interrupts after the runtime is disposed", async () => {
    const host = makeHost();
    const { stream, wasInterrupted } = makeNeverStream();
    const rejections: unknown[] = [];

    function recordRejection(reason: unknown): void {
      rejections.push(reason);
    }

    process.on("unhandledRejection", recordRejection);

    try {
      const sub = streamToStream(host, stream).subscribe(() => {});
      await tick();
      // Dispose the runtime but NOT the scope, so the fiber is still live:
      // `dispose()` swaps the managed runtime's effect for a defect, so an
      // interrupt forked on IT would die instead of landing. The teardown
      // uses the global runtime precisely so this still works.
      await host.runtime.dispose();
      expect(wasInterrupted()).toBe(false);

      expect(() => {
        sub.unsubscribe();
      }).not.toThrow();
      await tick();
      expect(wasInterrupted()).toBe(true);
      await tick();
    } finally {
      process.off("unhandledRejection", recordRejection);
      await Effect.runPromise(Scope.close(host.scope, Exit.void));
    }

    expect(rejections).toEqual([]);
  });

  it("refToStateStream() carries the current value synchronously, then changes", async () => {
    const host = useHost();
    const ref = await host.runtime.runPromise(SubscriptionRef.make(5));
    const seen: number[] = [];
    const sub = refToStateStream(host, ref).subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([5]);
    await host.runtime.runPromise(SubscriptionRef.set(ref, 6));
    await tick();
    expect(seen).toEqual([5, 6]);
    sub.unsubscribe();
  });

  it("refToStateStream() observes a set made while it is still cold", async () => {
    const host = useHost();
    const ref = await host.runtime.runPromise(SubscriptionRef.make(5));
    const stream = refToStateStream(host, ref);
    // Nobody has subscribed yet — the value must still be read per
    // subscription, not frozen at construction.
    await host.runtime.runPromise(SubscriptionRef.set(ref, 6));
    const seen: number[] = [];
    const sub = stream.subscribe((v: number) => {
      seen.push(v);
    });
    expect(seen).toEqual([6]);
    await tick();
    expect(seen).toEqual([6]);
    sub.unsubscribe();
  });

  it("refToStateStream() re-reads the ref on every cold → warm cycle", async () => {
    const host = useHost();
    const ref = await host.runtime.runPromise(SubscriptionRef.make(5));
    const stream = refToStateStream(host, ref);

    const first: number[] = [];
    const firstSub = stream.subscribe((v: number) => {
      first.push(v);
    });
    expect(first).toEqual([5]);
    firstSub.unsubscribe();

    await host.runtime.runPromise(SubscriptionRef.set(ref, 7));

    const second: number[] = [];
    const secondSub = stream.subscribe((v: number) => {
      second.push(v);
    });
    expect(second).toEqual([7]);
    await tick();
    expect(second).toEqual([7]);
    secondSub.unsubscribe();
  });
});

/** A host of the same shape `composeWithBase` builds: a ManagedRuntime plus
 * the scope every stream fiber is forked into. */
function makeHost(): EffectHost {
  return {
    runtime: ManagedRuntime.make(Layer.empty),
    scope: Effect.runSync(Scope.make()),
  };
}

async function closeHost(host: EffectHost): Promise<void> {
  await Effect.runPromise(Scope.close(host.scope, Exit.void));
  await host.runtime.dispose();
}

/** A stream that never ends and reports its own interruption. */
function makeNeverStream(): NeverStream {
  let interrupted = false;
  const stream = Stream.fromEffect(
    Effect.never.pipe(
      Effect.onInterrupt(() => {
        return Effect.sync(() => {
          interrupted = true;
        });
      }),
    ),
  );
  return {
    stream,
    wasInterrupted: () => {
      return interrupted;
    },
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface NeverStream {
  stream: Stream.Stream<never>;
  wasInterrupted: () => boolean;
}
