import { expect, test } from "@jest/globals";

import { SCENARIO_IDS } from "./scenarioIds";
import { getScenario, SCENARIOS } from "./scenarios";

test("has unique ids and covers the chosen prove-the-harness surfaces", () => {
  const ids = SCENARIOS.map((s) => {
    return s.id;
  });
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain("blotter/seeded");
  expect(ids).toContain("shell/connection-banner");
});

test("registry ids stay in sync with the pure SCENARIO_IDS runner list", () => {
  // The Node/tsx runners iterate SCENARIO_IDS (no RN import); the registry
  // builds RN scenarios. They must not drift, or a runner would silently skip
  // (or fail to find) a scenario.
  expect(
    SCENARIOS.map((s) => {
      return s.id;
    }).sort(),
  ).toEqual([...SCENARIO_IDS].sort());
});

test("resolves by id", () => {
  expect(getScenario("blotter/seeded")?.skin).toBeDefined();
  expect(getScenario("nope")).toBeUndefined();
});
