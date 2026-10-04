import { describe, expect, it } from "vitest";

import {
  createSimulatorPorts,
  InMemorySessionStore,
} from "@rtc/client-adapters";
import { createFakeConnectionPorts } from "@rtc/client-adapters/testing";
import {
  AuthSimulator,
  ConnectionEventsSimulator,
  PreferencesSimulator,
} from "@rtc/domain";

import { createApp, createMachineFactories } from "#/composition";

describe("layout machine factory", () => {
  it("builds a layout machine seeded with the tab's default arrangement", () => {
    const { presenters } = createApp({
      ...createSimulatorPorts({
        preferences: new PreferencesSimulator(),
        auth: new AuthSimulator({}),
        sessionStore: new InMemorySessionStore(),
      }),
      ...createFakeConnectionPorts(new ConnectionEventsSimulator()),
    });
    const machines = createMachineFactories(presenters);
    const m = machines.layout("fx");
    let seen: import("@rtc/core-api").LayoutState | undefined;
    const sub = m.state$.subscribe((s) => {
      seen = s;
    });
    sub.unsubscribe();

    if (!seen) {
      throw new Error("layout state did not emit synchronously");
    }

    // fx arrangement: a tiles+blotter column beside the analytics/positions
    // rail — a row split at the root (prototype shape, same as equities).
    if (seen.root.kind !== "split") {
      throw new Error("split root expected");
    }

    expect(seen.root.dir).toBe("row");
    m.intents.maximize("fx-rates");
    const after = (() => {
      let s2: import("@rtc/core-api").LayoutState | undefined;
      const sub2 = m.state$.subscribe((s) => {
        s2 = s;
      });
      sub2.unsubscribe();
      return s2;
    })();
    expect(after?.maximized).toBe("fx-rates");
    m.dispose();
  });
});
