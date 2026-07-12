import type { Scenario } from "@ui-visual-shared/scenarios";

import type { AppData } from "../shared/appData";

/** Resolve a scenario's fixture into AppData, layering the scenario's optional
 *  themeSkin/themeMode override on top. Returns the fixture object unchanged
 *  (same reference) when there is no override, so base scenarios are untouched. */
export function resolveScenarioData(
  scenario: Scenario,
  fixtures: Record<string, AppData>,
): AppData {
  const base = fixtures[scenario.fixtureKey];

  if (!base) {
    throw new Error(`Unknown fixture: ${scenario.fixtureKey}`);
  }

  if (!scenario.themeSkin && !scenario.themeMode) {
    return base;
  }

  return {
    ...base,
    themeSkin: scenario.themeSkin ?? base.themeSkin,
    themeMode: scenario.themeMode ?? base.themeMode,
  };
}
