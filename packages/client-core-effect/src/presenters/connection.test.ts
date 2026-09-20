// packages/client-core-effect/src/presenters/connection.test.ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { Subject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import { type ConnectionEvent, ConnectionStatus } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createConnectionPresenter } from "#/presenters/connection";

describe("createConnectionPresenter (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("folds events on a fiber and conflates a state an ignored event leaves unchanged", async () => {
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter(useHost(), {
      events: () => {
        return events;
      },
    });
    const seen: ConnectionStatus[] = [];
    const sub = presenter.status$.subscribe((s) => {
      seen.push(s);
    });
    expect(seen).toEqual([ConnectionStatus.CONNECTING]);
    await tick();
    events.next({ type: "gatewayConnected" });
    events.next({ type: "userActivity" });
    await tick();
    await tick();
    // The RxJS core would re-emit CONNECTED for the ignored event; the
    // SubscriptionRef fold does not — the difference §22 records.
    expect(seen).toEqual([
      ConnectionStatus.CONNECTING,
      ConnectionStatus.CONNECTED,
    ]);
    sub.unsubscribe();
    await tick();
    expect(events.observed).toBe(false);
  });

  it("surfaces a port error as a stream error", async () => {
    const events = new Subject<ConnectionEvent>();
    const presenter = createConnectionPresenter(useHost(), {
      events: () => {
        return events;
      },
    });
    const boom = new Error("socket");
    const failure = new Promise<unknown>((resolve) => {
      presenter.status$.subscribe({ error: resolve });
    });
    await tick();
    events.error(boom);
    expect(await failure).toBe(boom);
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

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** The host these tests build: a `ManagedRuntime` (which satisfies
 * `EffectRunner` structurally) plus the scope every stream fiber is forked
 * into — and, unlike the narrow `EffectHost`, the runtime's own `dispose`,
 * which the teardown drives directly. */
interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}
