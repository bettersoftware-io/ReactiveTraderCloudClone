import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { EffectHost } from "#/bridge/out";
import { mirrorPortAsIs } from "#/presenters/mirrorPort";

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
