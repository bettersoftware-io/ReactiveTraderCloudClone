import type { Scenario } from "./scenarios";

// A matrix-expanded scenario key ends in `__<skin>-<mode>`; the `__` guard means
// natural keys ending in `-light`/`-dark` (e.g. `app/fx-light`) are NOT stripped.
const COMBO_SUFFIX =
  /__(?:classic|holo|holo3d|terminal|terminal3d)-(?:dark|light)$/;

/** The base scenario name for a (possibly matrix-expanded) key — strips a
 *  trailing `__<skin>-<mode>` combo suffix. */
export function baseScenarioName(name: string): string {
  return name.replace(COMBO_SUFFIX, "");
}

/** Extension-less golden path for a scenario: `<skin>-<mode>/<base-name>`.
 *  Theme+mode is a folder under the spec dir; the file is the base scenario
 *  name with `/`→`-`. Each tier appends its own extension (playwright/CT add
 *  `.png`; vitest-browser appends `-<browser>.png`). Every scenario carries an
 *  explicit themeSkin/themeMode after expansion; the `?? classic/dark` fallback
 *  only guards a hand-authored base scenario that forgot them. */
export function goldenPath(name: string, scenario: Scenario): string {
  const base = baseScenarioName(name).replace(/\//g, "-");
  return `${scenario.themeSkin ?? "classic"}-${scenario.themeMode ?? "dark"}/${base}`;
}

/** Playwright's ARRAY-arg form: `[<skin>-<mode>, <base-name>.png]`. Required for
 *  the playwright / playwright-ct tiers because a STRING arg containing `/` is
 *  flattened to `-` by Playwright, whereas array path-segments nest a real subdir.
 *  `goldenPath` always has exactly one `/` (folder and base-name are each `/`-free),
 *  so splitting at it is safe. */
export function goldenPathArray(
  name: string,
  scenario: Scenario,
): [string, string] {
  const p = goldenPath(name, scenario);
  const slash = p.indexOf("/");
  return [p.slice(0, slash), `${p.slice(slash + 1)}.png`];
}
