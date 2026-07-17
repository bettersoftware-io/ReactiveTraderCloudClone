import { expect, test } from "@jest/globals";

import { getScenario, SCENARIOS } from "./scenarios";

test("has unique ids and covers the chosen prove-the-harness surfaces", () => {
  const ids = SCENARIOS.map((s) => {
    return s.id;
  });
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids).toContain("blotter/empty");
  expect(ids).toContain("shell/connection-banner");
  expect(ids).toContain("credit/rfq-tiles-empty");
});

test("resolves by id", () => {
  expect(getScenario("blotter/empty")?.skin).toBeDefined();
  expect(getScenario("nope")).toBeUndefined();
});
