import { describe, expect, it } from "vitest";

import { createDefaultLayoutPort } from "@rtc/core-logic";

import { createLayoutMachine } from "#/machines/layout";

describe("layout machine (effect)", () => {
  it("starts from the seed when there is one; reset returns to the initial tree", () => {
    const initial = createDefaultLayoutPort("fx").initial;
    const seed = { ...initial, maximized: "fx-rates" };
    const machine = createLayoutMachine(initial, seed);

    expect(machine.ref.get()).toBe(seed);
    machine.intents.reset();
    expect(machine.ref.get()).toBe(initial);
  });

  it("an intent commits synchronously; after dispose it changes nothing; dispose twice is harmless", () => {
    const initial = createDefaultLayoutPort("fx").initial;
    const machine = createLayoutMachine(initial, undefined);

    machine.intents.maximize("fx-rates");
    expect(machine.ref.get().maximized).toBe("fx-rates");
    machine.dispose();
    machine.dispose();
    machine.intents.restore();
    expect(machine.ref.get().maximized).toBe("fx-rates");
  });
});
