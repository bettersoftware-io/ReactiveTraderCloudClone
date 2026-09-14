import { describe, expect, it } from "vitest";

import { type PanelRegistry, reuseRegistryEntries } from "../panelRegistry";

describe("reuseRegistryEntries", () => {
  it("keeps the previous reference for a surviving id, takes a new id fresh, and drops a departed id", () => {
    const kept = entry();
    const departed = entry();
    const previous: PanelRegistry = {
      "eq-chart:AAPL": kept,
      "eq-chart:MSFT": departed,
    };
    const rebuiltAapl = entry();
    const joined = entry();

    const result = reuseRegistryEntries(previous, {
      "eq-chart:AAPL": rebuiltAapl,
      "eq-chart:TSLA": joined,
    });

    expect(result["eq-chart:AAPL"]).toBe(kept);
    expect(result["eq-chart:TSLA"]).toBe(joined);
    expect(Object.keys(result)).toEqual(["eq-chart:AAPL", "eq-chart:TSLA"]);
  });
});

function entry(): () => null {
  return () => {
    return null;
  };
}
