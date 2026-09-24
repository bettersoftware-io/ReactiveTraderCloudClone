import { describe, expect, it } from "vitest";

import { createDefaultLayoutPort } from "@rtc/client-core";

import { createLayoutMachine } from "#/machines/layout";

describe("layout machine (async)", () => {
  it("starts from the seed when there is one; reset returns to the initial tree", () => {
    const initial = createDefaultLayoutPort("fx").initial;
    const seed = { ...initial, maximized: "fx-rates" };
    const machine = createLayoutMachine(
      initial,
      seed,
      new AbortController().signal,
    );

    expect(machine.store.get()).toBe(seed);
    machine.intents.reset();
    expect(machine.store.get()).toBe(initial);
  });

  it("after dispose an intent changes nothing; dispose twice is harmless", () => {
    const initial = createDefaultLayoutPort("fx").initial;
    const machine = createLayoutMachine(
      initial,
      undefined,
      new AbortController().signal,
    );

    machine.dispose();
    machine.dispose();
    machine.intents.maximize("fx-rates");
    expect(machine.store.get().maximized).toBe(null);
  });

  it("the lifetime's end disposes it: an intent changes nothing", () => {
    const lifetime = new AbortController();
    const initial = createDefaultLayoutPort("fx").initial;
    const machine = createLayoutMachine(initial, undefined, lifetime.signal);

    lifetime.abort();
    machine.intents.maximize("fx-rates");
    expect(machine.store.get().maximized).toBe(null);
  });
});
