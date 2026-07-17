import type { AppData } from "@ui-visual-shared/appData";
import type { Scenario } from "@ui-visual-shared/scenarios";

/** Resolve a scenario's fixture into AppData, layering the scenario's optional
 *  themeSkin/themeMode override on top. Returns the fixture object unchanged
 *  (same reference) when there is no override, so base scenarios are untouched.
 *  Framework-free logic — byte-identical to the react tier's copy
 *  (packages/client-react/tests/ui/visual/react/resolveScenarioData.ts); a
 *  candidate for a future move into @rtc/ui-contract's shared visual harness,
 *  out of scope for this task. */
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
