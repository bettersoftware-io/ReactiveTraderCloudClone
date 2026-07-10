import { MATRIX_MODES, MATRIX_SKINS, type Scenario } from "./scenarios";

// A matrix-expanded scenario key ends in `__<skin>-<mode>`; the `__` guard means
// natural keys ending in `-light`/`-dark` (e.g. `app/fx-light`) are NOT stripped.
// Derived from MATRIX_SKINS/MATRIX_MODES so the ADR-001 escape hatch (curate the
// matrix by editing those arrays) stays correct — no second list to keep in sync.
// All matrix values are alphanumeric, so no regex escaping is needed.
const COMBO_SUFFIX = new RegExp(
  `__(?:${MATRIX_SKINS.join("|")})-(?:${MATRIX_MODES.join("|")})$`,
);

/** The base scenario name for a (possibly matrix-expanded) key — strips a
 *  trailing `__<skin>-<mode>` combo suffix. */
export function baseScenarioName(name: string): string {
  return name.replace(COMBO_SUFFIX, "");
}

/** Extension-less golden path for a scenario: `<skin>-<mode>/<base-name>`.
 *  Theme+mode is a folder under the spec dir; the file is the base scenario
 *  name with `/`→`-`. Used by the vitest-browser tier, whose `resolveScreenshotPath`
 *  nests this via `path.join` and appends `-<browser>.png`. The playwright /
 *  playwright-ct tiers use `goldenPathArray` instead (a string arg's `/` flattens
 *  in Playwright). Every scenario carries an explicit themeSkin/themeMode after
 *  expansion; the `?? classic/dark` fallback only guards a hand-authored base
 *  scenario that forgot them. */
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
