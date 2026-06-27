import { describe, expect, it } from "vitest";

import { createApp, createMachineFactories } from "../composition";

describe("layout machine factory", () => {
  it("builds a layout machine seeded with the tab's default arrangement", () => {
    const { presenters } = createApp();
    const machines = createMachineFactories(presenters);
    const m = machines.layout("fx");
    let seen: import("#/app/layout/layoutPort").LayoutState | undefined;
    const sub = m.state$.subscribe((s) => {
      seen = s;
    });
    sub.unsubscribe();
    if (!seen) throw new Error("layout state did not emit synchronously");
    // fx arrangement: rates + analytics fill, blotter pinned bottom
    if (seen.root.kind !== "split") throw new Error("split root expected");
    expect(seen.root.dir).toBe("column");
    m.intents.maximize("fx-rates");
    const after = (() => {
      let s2: import("#/app/layout/layoutPort").LayoutState | undefined;
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
