import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject, Observable } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EffectHost } from "#/bridge/out";
import { followPort, mirrorPortAsIs } from "#/presenters/mirrorPort";

describe("mirrorPort", () => {
  it("mirrorPortAsIs(host, source, { retain: true }) keeps the port subscribed across zero subscribers", async () => {
    const host = createHost();
    const source = new BehaviorSubject<number>(1);
    const stream = mirrorPortAsIs(host, source, { retain: true });
    stream.subscribe(() => {}).unsubscribe();
    await tick();
    expect(source.observed).toBe(true);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await tick();
    expect(source.observed).toBe(false);
    await host.runtime.dispose();
  });

  it("without the option the port is released on the last unsubscribe", async () => {
    const host = createHost();
    const source = new BehaviorSubject<number>(1);
    const stream = mirrorPortAsIs(host, source);
    stream.subscribe(() => {}).unsubscribe();
    await tick();
    expect(source.observed).toBe(false);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await host.runtime.dispose();
  });

  it("followPort subscribes the port ONCE per warm period and never at construction — no seed peek", async () => {
    const host = createHost();
    let subscribes = 0;
    const inner = new BehaviorSubject<number>(1);
    const source = new Observable<number>((subscriber) => {
      subscribes += 1;
      return inner.subscribe(subscriber);
    });
    const stream = followPort(host, source);
    // Built, not subscribed: `mirrorPort` would already have peeked here.
    expect(subscribes).toBe(0);

    const first: number[] = [];
    const a = stream.subscribe((value: number) => {
      first.push(value);
    });
    // No seed: a replay-current port's value arrives a fiber hop later, not
    // in this tick — the price `followPort` pays for not peeking.
    expect(first).toEqual([]);
    expect(subscribes).toBe(1);
    await tick();
    expect(first).toEqual([1]);

    // A late joiner replays the latest SYNCHRONOUSLY and joins the same
    // period, so the port is not called again.
    const late: number[] = [];
    const b = stream.subscribe((value: number) => {
      late.push(value);
    });
    expect(late).toEqual([1]);
    expect(subscribes).toBe(1);

    a.unsubscribe();
    b.unsubscribe();
    await tick();
    expect(inner.observed).toBe(false);

    // A fresh period is a fresh port call with no replay of the old one.
    const again: number[] = [];
    stream.subscribe((value: number) => {
      again.push(value);
    });
    expect(again).toEqual([]);
    expect(subscribes).toBe(2);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await host.runtime.dispose();
  });
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

function createHost(): TestHost {
  return {
    runtime: ManagedRuntime.make(Layer.empty),
    scope: Effect.runSync(Scope.make()),
  };
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
