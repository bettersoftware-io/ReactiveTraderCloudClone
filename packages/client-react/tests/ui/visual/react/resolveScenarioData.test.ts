import type { Scenario } from "@ui-visual-shared/scenarios";
import { describe, expect, it } from "vitest";

import type { AppData } from "../shared/appData";
import { resolveScenarioData } from "./resolveScenarioData";

const fixtures: Record<string, AppData> = {
  base: { themeSkin: "classic", themeMode: "dark" } as unknown as AppData,
};

describe("resolveScenarioData", () => {
  it("returns the fixture unchanged when the scenario has no theme override", () => {
    const scenario: Scenario = { componentKey: "App", fixtureKey: "base" };
    expect(resolveScenarioData(scenario, fixtures)).toBe(fixtures.base);
  });

  it("overrides themeSkin and themeMode when the scenario carries them", () => {
    const scenario: Scenario = {
      componentKey: "App",
      fixtureKey: "base",
      themeSkin: "holo3d",
      themeMode: "light",
    };
    const data = resolveScenarioData(scenario, fixtures);
    expect(data.themeSkin).toBe("holo3d");
    expect(data.themeMode).toBe("light");
    expect(fixtures.base.themeSkin).toBe("classic"); // must not mutate the fixture
  });

  it("throws on an unknown fixture key", () => {
    const scenario: Scenario = { componentKey: "App", fixtureKey: "missing" };
    expect(() => {
      return resolveScenarioData(scenario, fixtures);
    }).toThrow(/Unknown fixture/);
  });
});
