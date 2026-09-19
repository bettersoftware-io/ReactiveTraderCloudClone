// packages/client-core-effect/src/presenters/preferences.test.ts
import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { PreferencesSimulator } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createPowerSaverPresenter } from "#/presenters/preferences";

describe("createPowerSaverPresenter (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("isCalm$ conflates a calm to freeze transition (SubscriptionRef parity, distinct from the RxJS core's map)", async () => {
    const preferences = new PreferencesSimulator({ powerSaverLevel: "off" });
    const presenter = createPowerSaverPresenter(useHost(), preferences);
    const seen: boolean[] = [];
    const sub = presenter.isCalm$.subscribe((v) => {
      seen.push(v);
    });
    preferences.setPowerSaverLevel("calm");
    preferences.setPowerSaverLevel("freeze");
    await tick();
    await tick();
    expect(seen).toEqual([false, true]);
    sub.unsubscribe();
  });

  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host: EffectHost = {
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
