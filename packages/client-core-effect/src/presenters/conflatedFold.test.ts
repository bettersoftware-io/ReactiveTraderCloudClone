import { Effect, Exit, Layer, ManagedRuntime, Option, Scope } from "effect";
import { BehaviorSubject, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Stream } from "@rtc/core-api";

import type { EffectHost } from "#/bridge/out";
import { conflatedFold } from "#/presenters/conflatedFold";

describe("conflatedFold", () => {
  beforeEach(() => {
    // Installed BEFORE `useHost()`: an Effect runtime that captured the real
    // `setTimeout` before the swap would never advance.
    vi.useFakeTimers();
  });

  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }

    vi.useRealTimers();
  });

  it("while calm, emits the first value at once and the last of a burst at the window's end", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const seen = collect(
      conflatedFold(useHost(), source, calm, MS, () => {
        return Option.none<number>();
      }),
    );
    await settle();
    source.next(1);
    await settle();
    expect(seen).toEqual([1]);
    source.next(2);
    source.next(3);
    await vi.advanceTimersByTimeAsync(MS - 1);
    expect(seen).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(seen).toEqual([1, 3]);
  });

  it("while not calm, every value passes at once", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(false);
    const seen = collect(
      conflatedFold(useHost(), source, calm, MS, () => {
        return Option.none<number>();
      }),
    );
    await settle();
    source.next(1);
    source.next(2);
    source.next(3);
    await settle();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("calm → off takes effect at once: the next value passes without waiting for a window", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const seen = collect(
      conflatedFold(useHost(), source, calm, MS, () => {
        return Option.none<number>();
      }),
    );
    await settle();
    source.next(1);
    source.next(2);
    await settle();
    expect(seen).toEqual([1]);
    calm.next(false);
    await settle();
    source.next(3);
    await settle();
    expect(seen.at(-1)).toBe(3);
  });

  it("off → calm starts a fresh window: the first value after the flip is a leading emission", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(false);
    const seen = collect(
      conflatedFold(useHost(), source, calm, MS, () => {
        return Option.none<number>();
      }),
    );
    await settle();
    source.next(1);
    await settle();
    expect(seen).toEqual([1]);
    calm.next(true);
    await settle();
    source.next(2);
    await settle();
    expect(seen).toEqual([1, 2]);
    source.next(3);
    await settle();
    expect(seen).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(MS);
    await settle();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("a value arriving before the flag has spoken is dropped", async () => {
    const source = new Subject<number>();
    const calm = new Subject<boolean>();
    const seen = collect(
      conflatedFold(useHost(), source, calm, MS, () => {
        return Option.none<number>();
      }),
    );
    await settle();
    source.next(1);
    await settle();
    expect(seen).toEqual([]);
    calm.next(false);
    await settle();
    source.next(2);
    await settle();
    expect(seen).toEqual([2]);
  });

  it("a Some seed is delivered synchronously on subscribe", () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(false);
    const seen = collect(
      conflatedFold(useHost(), source, calm, MS, () => {
        return Option.some(9);
      }),
    );
    expect(seen).toEqual([9]);
  });

  it("a burst driven in the SAME turn as the subscribe is not lost to the flag: the flag is subscribed first", async () => {
    // What the contract's FX suites actually drive — no settle between the
    // subscribe and the first tick. `fromPort(calm$)` is called before
    // `fromPort(source)` in plain synchronous code, so the flag's replayed
    // value is queued ahead of every tick and nothing is dropped as
    // "before the flag spoke".
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(false);
    const seen = collect(
      conflatedFold(useHost(), source, calm, MS, () => {
        return Option.none<number>();
      }),
    );
    source.next(1);
    source.next(2);
    source.next(3);
    await settle();
    expect(seen).toEqual([1, 2, 3]);
  });

  it("a window that ends with nothing pending CLOSES: the next value is a leading emission again", async () => {
    const source = new Subject<number>();
    const calm = new BehaviorSubject<boolean>(true);
    const seen = collect(
      conflatedFold(useHost(), source, calm, MS, () => {
        return Option.none<number>();
      }),
    );
    await settle();
    source.next(1);
    await settle();
    expect(seen).toEqual([1]);
    // Nothing pending when the window expires, so the loop ends rather than
    // sleeping forever …
    await vi.advanceTimersByTimeAsync(MS);
    await settle();
    expect(seen).toEqual([1]);
    // … and the next value is leading again, not a trailing one a window
    // later.
    source.next(2);
    await settle();
    expect(seen).toEqual([1, 2]);
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

/** Subscribe and keep every emission — the live log a case asserts on. */
function collect<T>(stream: Stream<T>): T[] {
  const values: T[] = [];
  stream.subscribe((value: T) => {
    values.push(value);
  });
  return values;
}

/** The fake-clock twin of the contract harness's `settle()`: two zero-length
 * advances, which move no time but drain the microtask continuations an
 * Effect fiber resumes on. */
async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

/** The host these tests build: a `ManagedRuntime` (which satisfies
 * `EffectRunner` structurally) plus the scope every stream fiber is forked
 * into — and, unlike the narrow `EffectHost`, the runtime's own `dispose`,
 * which the teardown drives directly. */
interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

const MS = 100;
