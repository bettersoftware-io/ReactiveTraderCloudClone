import { Effect, Exit, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { createDefaultLayoutPort } from "@rtc/client-core";

import { createDetachedHost, type EffectHost } from "#/bridge/out";
import { createLayoutMachine } from "#/machines/layout";

describe("layout machine (effect)", () => {
  afterEach(async () => {
    for (const host of hosts.splice(0)) {
      await Effect.runPromise(Scope.close(host.scope, Exit.void));
    }
  });

  it("starts from the seed when there is one; reset returns to the initial tree", () => {
    const initial = createDefaultLayoutPort("fx").initial;
    const seed = { ...initial, maximized: "fx-rates" };
    const machine = createLayoutMachine(useHost(), initial, seed);

    expect(machine.ref.get()).toBe(seed);
    machine.intents.reset();
    expect(machine.ref.get()).toBe(initial);
  });

  it("an intent commits synchronously; after dispose it changes nothing; dispose twice is harmless", () => {
    const initial = createDefaultLayoutPort("fx").initial;
    const machine = createLayoutMachine(useHost(), initial, undefined);

    machine.intents.maximize("fx-rates");
    expect(machine.ref.get().maximized).toBe("fx-rates");
    machine.dispose();
    machine.dispose();
    machine.intents.restore();
    expect(machine.ref.get().maximized).toBe("fx-rates");
  });

  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host = createDetachedHost();
    hosts.push(host);
    return host;
  }
});
