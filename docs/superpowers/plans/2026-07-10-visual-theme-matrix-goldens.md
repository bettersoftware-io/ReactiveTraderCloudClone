# Visual Theme-Matrix Goldens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate visual-regression goldens for the full theme matrix — Classic / Holo / Holo-3D / Terminal / Terminal-3D × Dark / Light (10 combos, neon excluded) — across every existing visual scenario, keeping the suite green as a CI gate.

**Architecture:** The two *data-driven* visual tiers (`playwright/visual.spec.ts`, `vitest-browser/visual.spec.tsx`) already loop `Object.keys(scenarios)`. We add a **theme-matrix expander** in `shared/scenarios.ts` that cross-products each base scenario with the 9 non-`classic-dark` skin/mode combos, tagging each derived scenario with a `themeSkin`/`themeMode` override that `VisualScenario.tsx` layers onto the fixture's `AppData` before building the fake ViewModel. The bare (un-suffixed) scenarios remain the `classic-dark` baseline, so their existing goldens don't churn. The **`playwright-ct` tier is rewritten to be data-driven too** — one `matrix.spec.tsx` looping `scenarios` (mirroring the plain-Playwright tier's body via `scenarioActionFor`) replaces the 15 hand-written per-component specs — so all three tiers derive identically from the shared manifest and every combo is captured in every tier. Canonical `react/` goldens are baked inside the CI Playwright container via `update-visual-goldens.yml`; the per-arch `react-local/` set is generated on the dev machine (darwin-arm64 here; linux-arm64 in the aarch64 sandbox).

**Tech Stack:** TypeScript, Playwright `toHaveScreenshot`, vitest-browser `toMatchScreenshot`, `@rtc/domain` `ThemeSkin`/`ThemeModePreference`, GitHub Actions (`workflow_dispatch` golden regen).

## Global Constraints

- **Canonical goldens are container-only.** The `react/` set MUST be regenerated inside `mcr.microsoft.com/playwright:v1.61.0-noble` (via `update-visual-goldens.yml`); locally-generated `react/` pixels drift ±1px against CI. Only `react-local/darwin-arm64/` may be generated on this Mac. (ADR-001 "Cross-platform pixel drift".)
- **Serial visual runners.** `RTC_VISUAL_MAX_PARALLEL=1` in `ci.yml`'s `visual` job stays, and `playwright-ct.config.ts` keeps `workers: 1` — concurrent tier/worker runs let Playwright's stable-frame check capture text-dense shots one frame early. Do not parallelize to "speed up" the larger matrix.
- **Braces mandatory (`style/useBlockStatements`, PR #145).** Every `if`/`for`/`while`/`else` needs a block body — brace-less control statements fail CI. All new spec/expander code must be fully braced.
- **Skins:** `classic | holo | holo3d | terminal | terminal3d` (neon **excluded** by request). Modes: `dark | light`. Values verbatim from `@rtc/domain` `ThemeSkin` / `ThemeMode`.
- **Naming & layout (user-confirmed: theme sub-folder):** derived scenario **key** = `` `${base}__${skin}-${mode}` `` (uniqueness in the map); golden **path** = `` `${skin}-${mode}/${base-with-dashes}` `` under the spec dir, e.g. `…/<specfile>/holo3d-light/app-fx.png`. There is **no bare baseline** — classic-dark is the `classic-dark/` folder. Computed by the shared `goldenPath` module. **Playwright flattens a string arg containing `/` to `-` (verified empirically), so the playwright + playwright-ct tiers MUST pass the array form `goldenPathArray(name, scenario)` → `[<skin>-<mode>, <base>.png]` to nest the subdir; the vitest-browser tier passes the string `goldenPath(name, scenario)` (its `resolveScreenshotPath` nests via `path.join`).** The rewritten CT tier writes under a single `matrix.spec.tsx/` dir. Because every existing golden moves into a folder, Tasks 4-5 must **delete the pre-existing flat goldens** (they'd otherwise linger as orphans that `--update` never overwrites).
- **All three tiers get the full matrix.** playwright-ct, playwright, vitest-browser each capture all 1222 scenarios (124 base + 1098 combos). CT is rewritten to data-driven for this (Task 3).
- **Isolation:** all work in the `visual-theme-matrix` worktree; PR + green CI + merge-commit per `shipping-repo-changes`. Broad UI rounds need **user live-acceptance before merge** (spot-check a sample of new theme goldens).
- **Escape hatch (document, don't build):** matrix scope lives in three symbols (`MATRIX_SKINS`, `MATRIX_MODES`, `MATRIX_EXCLUDE`). Curation later = editing those. De-gating later = splitting `visual` into a small smoke gate + on-demand full run (the `update-visual-goldens.yml` `workflow_dispatch` pattern already exists).

---

### Task 1: Theme-override seam in the resolver

**Files:**
- Modify: `packages/client-react/tests/ui/visual/shared/scenarios.ts` (extend `Scenario` type only — expander is Task 2)
- Modify: `packages/client-react/tests/ui/visual/react/VisualScenario.tsx:59-64`
- Create: `packages/client-react/tests/ui/visual/react/resolveScenarioData.ts`
- Test: `packages/client-react/tests/ui/visual/react/resolveScenarioData.test.ts`

**Interfaces:**
- Consumes: `AppData` (`../shared/appData`), `fixtures` (`../shared/fixtures`), `Scenario` (`../shared/scenarios`).
- Produces: `resolveScenarioData(scenario: Scenario, fixtures: Record<string, AppData>): AppData` — returns the fixture's `AppData` with `themeSkin`/`themeMode` overridden when the scenario carries them (used by `VisualScenario`). Also the extended `Scenario` shape `{ componentKey, fixtureKey, themeSkin?, themeMode? }`.

- [ ] **Step 1: Extend the `Scenario` interface**

In `shared/scenarios.ts`, add the domain import and two optional fields:

```ts
import type { ThemeModePreference, ThemeSkin } from "@rtc/domain";

// Neutral manifest: a scenario name maps to a component key (resolved per
// framework by registry.tsx) and a fixture key (resolved from fixtures.ts).
export interface Scenario {
  readonly componentKey: string;
  readonly fixtureKey: string;
  /** Theme-skin override layered onto the fixture's AppData by VisualScenario.
   *  Matrix-expanded scenarios set this; base scenarios omit it and fall back
   *  to the fixture's own themeSkin (classic in the fakes). */
  readonly themeSkin?: ThemeSkin;
  /** Theme-mode override (see themeSkin). */
  readonly themeMode?: ThemeModePreference;
}
```

- [ ] **Step 2: Write the failing test for `resolveScenarioData`**

Create `react/resolveScenarioData.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AppData } from "../shared/appData";
import type { Scenario } from "../shared/scenarios";
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
    expect(() => resolveScenarioData(scenario, fixtures)).toThrow(/Unknown fixture/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react exec vitest run tests/ui/visual/react/resolveScenarioData.test.ts`
Expected: FAIL — "Cannot find module './resolveScenarioData'".

- [ ] **Step 4: Implement `resolveScenarioData`**

Create `react/resolveScenarioData.ts`:

```ts
import type { AppData } from "../shared/appData";
import type { Scenario } from "../shared/scenarios";

/** Resolve a scenario's fixture into AppData, layering the scenario's optional
 *  themeSkin/themeMode override on top. Returns the fixture object unchanged
 *  (same reference) when there is no override, so base scenarios are untouched. */
export function resolveScenarioData(
  scenario: Scenario,
  fixtures: Record<string, AppData>,
): AppData {
  const base = fixtures[scenario.fixtureKey];
  if (!base) throw new Error(`Unknown fixture: ${scenario.fixtureKey}`);
  if (!scenario.themeSkin && !scenario.themeMode) return base;
  return {
    ...base,
    themeSkin: scenario.themeSkin ?? base.themeSkin,
    themeMode: scenario.themeMode ?? base.themeMode,
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react exec vitest run tests/ui/visual/react/resolveScenarioData.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire `VisualScenario` to use the resolver**

In `react/VisualScenario.tsx`, replace lines 59-64 (`const scenario = ...` through the `data`/`render` lookups) so `data` comes from the resolver:

```ts
  const scenario = scenarios[name];
  if (!scenario) throw new Error(`Unknown visual scenario: ${name}`);
  const data = resolveScenarioData(scenario, fixtures);
  const render = registry[scenario.componentKey];
  if (!render) throw new Error(`Unknown component: ${scenario.componentKey}`);
```

Add the import near the other local imports:

```ts
import { resolveScenarioData } from "./resolveScenarioData";
```

(The `if (!data) throw` line is now redundant — `resolveScenarioData` throws on a missing fixture — so remove it.)

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @rtc/client-react typecheck`
Expected: PASS.

```bash
git add packages/client-react/tests/ui/visual/shared/scenarios.ts \
        packages/client-react/tests/ui/visual/react/resolveScenarioData.ts \
        packages/client-react/tests/ui/visual/react/resolveScenarioData.test.ts \
        packages/client-react/tests/ui/visual/react/VisualScenario.tsx
git commit -m "test(visual): theme-override seam in the scenario resolver"
```

---

### Task 2: Theme-matrix expander + shared goldenPath + action resolver

**Files:**
- Modify: `packages/client-react/tests/ui/visual/shared/scenarios.ts` (add `ThemeMode` to the type import; add explicit `themeSkin`/`themeMode` to the two `MATRIX_EXCLUDE` entries; rename literal to `baseScenarios`; add expander + exports)
- Create: `packages/client-react/tests/ui/visual/shared/goldenPath.ts` (`baseScenarioName` + `goldenPath`)
- Modify: `packages/client-react/tests/ui/visual/scenarioActions.ts` (add `scenarioActionFor`, reusing `baseScenarioName`)
- Modify: `packages/client-react/tests/ui/visual/playwright/visual.spec.ts` (loop `Object.entries`, use `scenarioActionFor` + `goldenPath`; delete local `goldenName`)
- Modify: `packages/client-react/tests/ui/visual/vitest-browser/visual.spec.tsx` (same)
- Test: `packages/client-react/tests/ui/visual/shared/scenarios.test.ts`

**Interfaces:**
- Consumes: `Scenario` (Task 1).
- Produces:
  - `MATRIX_SKINS: readonly ThemeSkin[]`, `MATRIX_MODES: readonly ThemeMode[]`.
  - `scenarios: Record<string, Scenario>` — **every** base scenario replaced by its full 10-combo cross-product (each carrying explicit `themeSkin`/`themeMode`), except `MATRIX_EXCLUDE` scenarios which pass through with their own authored `themeSkin`/`themeMode`. No bare base keys remain.
  - `baseScenarioName(name: string): string` — strips a `__<skin>-<mode>` suffix (`shared/goldenPath.ts`).
  - `goldenPath(name: string, scenario: Scenario): string` — extension-less `<skin>-<mode>/<base-name>` (`shared/goldenPath.ts`); consumed by the vitest-browser tier (its `resolveScreenshotPath` nests via `path.join` and appends `-<browser>.png`).
  - `goldenPathArray(name: string, scenario: Scenario): [string, string]` — `[<skin>-<mode>, <base-name>.png]` (`shared/goldenPath.ts`); consumed by the playwright + playwright-ct tiers because Playwright flattens a string arg's `/` (array segments nest a real subdir).
  - `scenarioActionFor(name: string): ScenarioAction` — maps a matrix name (`app/credit__holo-dark`) back to its base action (`app/credit`) via `baseScenarioName`.

**Layout decision (user-confirmed):** theme+mode is a **folder** under the spec dir: `…/<specfile>/<skin>-<mode>/<base-name>.png`. So every scenario carries an explicit skin+mode and there is **no bare classic-dark baseline** — classic-dark is just the `classic-dark/` folder. The two excluded scenarios route to `classic-light/` (`app/fx-light`) and `classic-system/` (`app/fx-system`) via their authored fields; setting those fields is a no-op over what their fixtures already seed (so their toggle aria-label assertions are unchanged).

- [ ] **Step 1: Give the two excluded scenarios explicit theme fields**

In `shared/scenarios.ts`, add `themeSkin`/`themeMode` to the two entries so `goldenPath` can route them (values match what their fixtures already seed — no behaviour change):

```ts
  "app/fx-light": {
    componentKey: "App",
    fixtureKey: "app-fx-light",
    themeSkin: "classic",
    themeMode: "light",
  },
```
```ts
  "app/fx-system": {
    componentKey: "App",
    fixtureKey: "app-fx-system",
    themeSkin: "classic",
    themeMode: "system",
  },
```

- [ ] **Step 2: Write the failing tests (expander + goldenPath)**

Create `shared/scenarios.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { goldenPath, goldenPathArray } from "./goldenPath";
import { MATRIX_MODES, MATRIX_SKINS, scenarios } from "./scenarios";

describe("theme-matrix expansion", () => {
  it("emits every skin×mode combo (incl. classic-dark) for an expandable base", () => {
    expect(scenarios["app/fx__classic-dark"]).toEqual({
      componentKey: "App",
      fixtureKey: "app-fx",
      themeSkin: "classic",
      themeMode: "dark",
    });
    expect(scenarios["app/fx__holo3d-light"]).toEqual({
      componentKey: "App",
      fixtureKey: "app-fx",
      themeSkin: "holo3d",
      themeMode: "light",
    });
  });

  it("replaces the bare base key with combos (no un-suffixed app/fx)", () => {
    expect(scenarios["app/fx"]).toBeUndefined();
  });

  it("yields exactly 10 combos per expandable base and excludes neon", () => {
    expect(MATRIX_SKINS).not.toContain("neon");
    const combos = Object.keys(scenarios).filter((k) => k.startsWith("app/fx__"));
    expect(combos).toHaveLength(MATRIX_SKINS.length * MATRIX_MODES.length); // 5×2 = 10
  });

  it("keeps mode-cycle scenarios un-expanded but with explicit theme fields", () => {
    expect(scenarios["app/fx-light__holo-dark"]).toBeUndefined();
    expect(scenarios["app/fx-light"]).toEqual({
      componentKey: "App",
      fixtureKey: "app-fx-light",
      themeSkin: "classic",
      themeMode: "light",
    });
  });

  it("routes goldens into a <skin>-<mode>/ folder by base name", () => {
    expect(
      goldenPath("app/fx__terminal-light", scenarios["app/fx__terminal-light"]),
    ).toBe("terminal-light/app-fx");
    expect(goldenPath("app/fx-light", scenarios["app/fx-light"])).toBe(
      "classic-light/app-fx-light",
    );
  });

  it("goldenPathArray splits into [folder, file.png] for Playwright's array arg", () => {
    expect(
      goldenPathArray("app/fx__terminal-light", scenarios["app/fx__terminal-light"]),
    ).toEqual(["terminal-light", "app-fx.png"]);
    expect(goldenPathArray("app/fx-light", scenarios["app/fx-light"])).toEqual([
      "classic-light",
      "app-fx-light.png",
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @rtc/client-react exec vitest run tests/ui/visual/shared/scenarios.test.ts`
Expected: FAIL — `./goldenPath` missing; `MATRIX_SKINS`/`MATRIX_MODES` not exported.

- [ ] **Step 4: Create `shared/goldenPath.ts`**

```ts
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
 *  name with `/`→`-`. Used by the vitest-browser tier, whose `resolveScreenshotPath`
 *  joins this into a real subdir and appends `-<browser>.png`. Every scenario
 *  carries an explicit themeSkin/themeMode after expansion; the `?? classic/dark`
 *  fallback only guards a hand-authored base scenario that forgot them. */
export function goldenPath(name: string, scenario: Scenario): string {
  const base = baseScenarioName(name).replace(/\//g, "-");
  return `${scenario.themeSkin ?? "classic"}-${scenario.themeMode ?? "dark"}/${base}`;
}

/** Playwright's ARRAY-arg form: `[<skin>-<mode>, <base-name>.png]`. Required for
 *  the playwright / playwright-ct tiers because a STRING arg containing `/` is
 *  flattened to `-` by Playwright (verified: `"a/b.png"` → `a-b.png`), whereas
 *  array path-segments nest a real subdir. `goldenPath` always has exactly one
 *  `/` (folder and base-name are each `/`-free), so splitting at it is safe. */
export function goldenPathArray(
  name: string,
  scenario: Scenario,
): [string, string] {
  const p = goldenPath(name, scenario);
  const slash = p.indexOf("/");
  return [p.slice(0, slash), `${p.slice(slash + 1)}.png`];
}
```

- [ ] **Step 5: Add the expander to `shared/scenarios.ts`**

Add `ThemeMode` to the existing `@rtc/domain` type import. Rename the `export const scenarios: Record<string, Scenario> = { … }` literal to `const baseScenarios: Record<string, Scenario> = { … }` (change only that declaration line; entries stay as-is except Step 1's two edits). Then append:

```ts
// The theme matrix: every skin except neon × dark/light. Every base scenario is
// REPLACED by its full 10-combo cross-product (each combo carries an explicit
// themeSkin/themeMode), so there is no bare baseline — classic-dark is the
// `classic-dark/` folder like any other combo.
export const MATRIX_SKINS = [
  "classic",
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
] as const satisfies readonly ThemeSkin[];
export const MATRIX_MODES = ["dark", "light"] as const satisfies readonly ThemeMode[];

// Scenarios that assert a mode-cycle-specific theme-toggle aria-label — they
// prove the toggle cycle, not the skin matrix, so they are NOT cross-producted.
// They carry their own authored themeSkin/themeMode (Step 1), so goldenPath still
// routes them to a folder (classic-light / classic-system).
const MATRIX_EXCLUDE = new Set<string>(["app/fx-light", "app/fx-system"]);

function expandThemeMatrix(
  base: Record<string, Scenario>,
): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};
  for (const [name, scenario] of Object.entries(base)) {
    if (MATRIX_EXCLUDE.has(name)) {
      out[name] = scenario;
      continue;
    }
    for (const skin of MATRIX_SKINS) {
      for (const mode of MATRIX_MODES) {
        out[`${name}__${skin}-${mode}`] = {
          ...scenario,
          themeSkin: skin,
          themeMode: mode,
        };
      }
    }
  }
  return out;
}

export const scenarios: Record<string, Scenario> = expandThemeMatrix(baseScenarios);
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @rtc/client-react exec vitest run tests/ui/visual/shared/scenarios.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Add `scenarioActionFor` to `scenarioActions.ts`**

At the end of `scenarioActions.ts` (import `baseScenarioName` from `./shared/goldenPath` — reuse it, do NOT re-declare the regex):

```ts
import { baseScenarioName } from "./shared/goldenPath";

/** Resolve the capture action for a scenario, mapping matrix-expanded names
 *  (`app/credit__holo-dark`) back to their base action (`app/credit`). */
export function scenarioActionFor(name: string): ScenarioAction {
  return scenarioActions[name] ?? scenarioActions[baseScenarioName(name)] ?? {};
}
```

(Put the `import` with the file's other imports at the top, not literally at the end.)

- [ ] **Step 8: Rewire both data-driven specs to `Object.entries` + `goldenPath`**

In `playwright/visual.spec.ts`: replace the imports + the `goldenName` helper + the loop header + the `shot` line. Delete the local `goldenName` function entirely. Use the **array** form `goldenPathArray` (a string arg with `/` flattens in Playwright — verified), passing it directly to both `toHaveScreenshot` branches:

```ts
import { expect, test } from "@playwright/test";

import { scenarioActionFor } from "../scenarioActions";
import { goldenPathArray } from "../shared/goldenPath";
import { scenarios } from "../shared/scenarios";

for (const [name, scenario] of Object.entries(scenarios)) {
  const action = scenarioActionFor(name);

  test(name, async ({ page }) => {
    // ...unchanged body...
    const shot = goldenPathArray(name, scenario); // [<skin>-<mode>, <base>.png]
    // ...unchanged toHaveScreenshot(shot, …) branches...
  });
}
```

In `vitest-browser/visual.spec.tsx`: same shape but the **string** form (vitest's `resolveScreenshotPath` nests via `path.join`) — swap the imports (add `scenarioActionFor` from `../scenarioActions` and `goldenPath` from `../shared/goldenPath`, drop the `scenarioActions` import), delete the local `goldenName`, change the loop to `for (const [name, scenario] of Object.entries(scenarios))`, `const action = scenarioActionFor(name);`, and the final capture to `await expect.element(target).toMatchScreenshot(goldenPath(name, scenario));`.

- [ ] **Step 9: Typecheck + lint + commit**

Run: `pnpm --filter @rtc/client-react typecheck`
Run: `pnpm --filter @rtc/client-react exec biome check tests/ui/visual/shared/scenarios.ts tests/ui/visual/shared/goldenPath.ts tests/ui/visual/scenarioActions.ts tests/ui/visual/playwright/visual.spec.ts tests/ui/visual/vitest-browser/visual.spec.tsx`
Expected: both PASS. (No goldens are generated in this task — that is Task 4. The `.spec` files won't run here; typecheck + the unit test prove the wiring.)

```bash
git add packages/client-react/tests/ui/visual/shared/scenarios.ts \
        packages/client-react/tests/ui/visual/shared/scenarios.test.ts \
        packages/client-react/tests/ui/visual/shared/goldenPath.ts \
        packages/client-react/tests/ui/visual/scenarioActions.ts \
        packages/client-react/tests/ui/visual/playwright/visual.spec.ts \
        packages/client-react/tests/ui/visual/vitest-browser/visual.spec.tsx
git commit -m "test(visual): theme-matrix expander + sub-folder goldenPath (5 skins × dark/light)"
```

---

### Task 3: Rewrite the playwright-ct tier to be data-driven

**Files:**
- Create: `packages/client-react/tests/ui/visual/playwright-ct/matrix.spec.tsx`
- Delete: the 15 hand-written CT specs — `admin.spec.tsx`, `admin-dashboard.spec.tsx`, `analytics.spec.tsx`, `app.spec.tsx`, `connection.spec.tsx`, `credit.spec.tsx`, `equities.spec.tsx`, `fxBlotter.spec.tsx`, `layout.spec.tsx`, `liveRates.spec.tsx`, `overlay.spec.tsx`, `positions.spec.tsx`, `shell.spec.tsx`, `stale.spec.tsx`, `tile.spec.tsx`
- Delete (regenerated under `matrix.spec.tsx/` in Tasks 4-5): the old bespoke CT golden dirs `packages/client-react/tests/ui/visual/playwright-ct/__screenshots__/{react,react-local/*}/{admin,admin-dashboard,analytics,app,connection,credit,equities,fxBlotter,layout,liveRates,overlay,positions,shell,stale,tile}.spec.tsx/`

**Interfaces:**
- Consumes: `scenarios` (Task 2), `scenarioActionFor` (Task 2), `VisualScenario` (`@ui-visual`).
- Produces: CT goldens at `matrix.spec.tsx/<skin>-<mode>/<base-name>.png` (shared `goldenPath`) — same paths as the plain-Playwright tier.

**Why safe:** every deleted CT test just mounted `VisualScenario name="<scenario-key>"`; all those keys are in `scenarios`. Tiers 2 & 3 already loop *all* scenarios (incl. `admin/panel-loading`, `equities-*`) with no `waitForText` and pass in CI — so dropping the hand-written per-spec text asserts is provably safe (`toHaveScreenshot` stability retry + `fontsReady` + `animations:disabled` are the settle barrier). The `beforeEach` below preserves the two real CT quirks (localStorage clear + the `**/throughput` stub the old `app/admin` test used).

- [ ] **Step 1: Create the data-driven CT spec**

Create `playwright-ct/matrix.spec.tsx`:

```tsx
import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

import { scenarioActionFor } from "../scenarioActions";
import { goldenPathArray } from "../shared/goldenPath";
import { scenarios } from "../shared/scenarios";

// Tier 1 — Playwright component tests, data-driven over the SAME shared scenario
// manifest + interaction table as ../playwright/visual.spec.ts and
// ../vitest-browser/visual.spec.tsx, so all three tiers stay behaviourally in
// lock-step across the full theme matrix. Goldens route via playwright-ct.config.ts
// (CI `react/` vs local `react-local/<arch>/`), under this file's `matrix.spec.tsx/`
// dir, at `<skin>-<mode>/<base-name>.png` via the shared goldenPathArray (the
// array form — a string arg with `/` flattens in Playwright).

test.beforeEach(async ({ page }) => {
  // State is seeded through the ViewModel seam, so clear any persisted prefs.
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  // AdminPanel reads throughput from the seam, but the old app/admin full-app
  // test stubbed this route — keep it (harmless no-op for every other scenario).
  await page.route("**/throughput", (route) => {
    return route.fulfill({ json: { value: 250 } });
  });
});

for (const [name, scenario] of Object.entries(scenarios)) {
  const action = scenarioActionFor(name);

  test(name, async ({ mount, page }) => {
    // Emulate reduced motion BEFORE mount so the boot sequence skips its rAF
    // canvas loop and only deterministic chrome renders.
    if (action.reducedMotion) {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }

    await mount(<VisualScenario name={name} />);

    if (action.click) {
      await page.getByTestId(action.click).click();
    }

    for (const step of action.steps ?? []) {
      if ("click" in step) {
        await page.getByTestId(step.click).click();
      } else if ("type" in step) {
        await page.getByTestId(step.type).fill(step.text);
      } else {
        await page.getByTestId(step.select).selectOption(step.value);
      }
    }

    if (action.waitForText) {
      await expect(page.getByText(action.waitForText)).toBeVisible();
    }

    if (action.assertAriaLabelOf !== undefined) {
      await expect(page.getByTestId(action.assertAriaLabelOf)).toHaveAttribute(
        "aria-label",
        action.expectAriaLabel,
      );
    }

    // Full-bleed scenarios (App/Boot/Lock/Prefs — all flagged fullPage) have no
    // scenario-root wrapper; component scenarios capture just their padded box.
    if (action.fullPage) {
      await expect(page).toHaveScreenshot(goldenPathArray(name, scenario), {
        animations: "disabled",
        fullPage: true,
      });
    } else {
      await expect(page.getByTestId("scenario-root")).toHaveScreenshot(
        goldenPathArray(name, scenario),
        { animations: "disabled" },
      );
    }
  });
}
```

- [ ] **Step 2: Delete the 15 hand-written specs**

```bash
cd packages/client-react/tests/ui/visual/playwright-ct
git rm admin.spec.tsx admin-dashboard.spec.tsx analytics.spec.tsx app.spec.tsx \
  connection.spec.tsx credit.spec.tsx equities.spec.tsx fxBlotter.spec.tsx \
  layout.spec.tsx liveRates.spec.tsx overlay.spec.tsx positions.spec.tsx \
  shell.spec.tsx stale.spec.tsx tile.spec.tsx
```

- [ ] **Step 3: Typecheck + lint the new spec**

Run: `pnpm --filter @rtc/client-react typecheck`
Run: `pnpm --filter @rtc/client-react exec biome check tests/ui/visual/playwright-ct/matrix.spec.tsx`
Expected: both PASS (all control statements braced per `useBlockStatements`).

- [ ] **Step 4: Smoke-run a subset on this arch to prove the spec drives correctly**

Run: `pnpm --filter @rtc/client-react exec playwright test -c tests/ui/visual/playwright-ct/playwright-ct.config.ts -g "app/fx__terminal-light" --update-snapshots`
Expected: PASS — writes `react-local/<arch>/matrix.spec.tsx/terminal-light/app-fx.png` (confirms the shared `goldenPath` sub-folder wiring end-to-end). Then revert this single golden — `git checkout -- packages/client-react/tests/ui/visual/playwright-ct/__screenshots__` — the full CT regen happens in Task 4.

- [ ] **Step 5: Commit the rewrite (goldens regenerated in Task 4)**

```bash
git add packages/client-react/tests/ui/visual/playwright-ct/matrix.spec.tsx
git commit -m "test(visual): data-driven playwright-ct tier (full theme matrix)"
```

---

### Task 4: Regenerate the local (darwin-arm64) golden set

**Files:**
- Regenerate: `packages/client-react/tests/ui/visual/playwright-ct/__screenshots__/react-local/darwin-arm64/matrix.spec.tsx/**`
- Regenerate: `packages/client-react/tests/ui/visual/playwright/__screenshots__/react-local/darwin-arm64/**`
- Regenerate: `packages/client-react/tests/ui/visual/vitest-browser/__screenshots__/react-local/darwin-arm64/**`
- **Not** regenerated here: `react-local/linux-arm64/**` (needs the aarch64 sandbox — see Step 5).

**Interfaces:** none (produces PNG artifacts consumed by the local `pnpm test:ui:visual` gate).

- [ ] **Step 1: Build workspace libs (the visual harness imports built dist/)**

Run: `pnpm build`
Expected: domain/shared/client-core build succeed.

- [ ] **Step 2: Delete the orphan-prone darwin-arm64 goldens first (folder move)**

The layout moves every golden into a `<skin>-<mode>/` sub-folder, so the old flat goldens (and the retired CT spec dirs) would linger as orphans — `--update` writes new files but never deletes stale ones. Remove the darwin-arm64 trees for all three tiers so regen starts from a clean slate (linux-arm64 is left untouched — handled in the sandbox):

```bash
git rm -r -q --ignore-unmatch \
  packages/client-react/tests/ui/visual/playwright-ct/__screenshots__/react-local/darwin-arm64 \
  packages/client-react/tests/ui/visual/playwright/__screenshots__/react-local/darwin-arm64 \
  packages/client-react/tests/ui/visual/vitest-browser/__screenshots__/react-local/darwin-arm64
```

- [ ] **Step 3: Regenerate all three local tiers**

Run: `pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update`
Run: `pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update`
Run: `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update`
Expected: ~1222 goldens per tier written under `react-local/darwin-arm64/<specfile>/<skin>-<mode>/`. Note the wall-clock of each — this is the CI-gate estimate.

- [ ] **Step 4: Sanity-check a themed golden differs from the classic-dark one**

Run: `open packages/client-react/tests/ui/visual/playwright/__screenshots__/react-local/darwin-arm64/visual.spec.ts/classic-dark/app-fx.png packages/client-react/tests/ui/visual/playwright/__screenshots__/react-local/darwin-arm64/visual.spec.ts/terminal-light/app-fx.png`
Expected: visibly different skins (classic-dark blue vs terminal-light amber-on-light).

- [ ] **Step 5: Confirm the local gate passes end-to-end**

Run: `pnpm --filter @rtc/client-react test:ui:visual`
Expected: all three tiers PASS against the freshly-written darwin-arm64 goldens.

- [ ] **Step 6: Commit the darwin-arm64 set + note the linux-arm64 follow-up**

The stale/orphaned `react-local/linux-arm64/` goldens (old CT spec dirs + missing matrix combos) will make the local gate red on an aarch64 box until regenerated there. Regenerate them in the sandbox with the same three `:update` commands, or leave a documented follow-up (Task 6). Stage the darwin set and the deletions of the retired CT golden dirs:

```bash
git add packages/client-react/tests/ui/visual/*/__screenshots__/react-local
git commit -m "test(visual): darwin-arm64 local goldens for the theme matrix (all 3 tiers)"
```

---

### Task 5: Bake the canonical `react/` goldens in CI + review

**Files:**
- Modify: `.github/workflows/update-visual-goldens.yml` (add a clean-before-regen step so the artifact has no orphans; note the theme matrix)
- Modify: `.github/workflows/ci.yml` (comment on the larger `visual` job + escape hatch; no behavioural change)
- Regenerate (via CI artifact): all three tiers' canonical sets — `packages/client-react/tests/ui/visual/{playwright-ct,playwright,vitest-browser}/__screenshots__/react/**` (CT now full-matrix under `matrix.spec.tsx/`, replacing the retired bespoke spec dirs)

**Interfaces:** none.

- [ ] **Step 1: Clean-before-regen + annotate the workflows**

The folder move orphans every old flat `react/` golden, and `--update` inside the container never deletes stale files — so without this the uploaded artifact would carry orphans. In `update-visual-goldens.yml`, add a step BEFORE the three regen steps that wipes the canonical `react/` screenshot dirs so the container regenerates a clean set:

```yaml
      - name: Clean canonical react/ goldens before regen (folder-layout move)
        run: |
          rm -rf packages/client-react/tests/ui/visual/playwright-ct/__screenshots__/react
          rm -rf packages/client-react/tests/ui/visual/playwright/__screenshots__/react
          rm -rf packages/client-react/tests/ui/visual/vitest-browser/__screenshots__/react
```

Also extend the top comment block to note it now regenerates the full theme matrix across all three tiers (CT is data-driven under `matrix.spec.tsx`, goldens under `<skin>-<mode>/` folders) and that the run is substantially longer.

In `ci.yml`'s `visual` job, add a comment above the `Visual diffs` step recording that the matrix makes this the critical-path job (~measure after first run) and pointing to the escape hatch (smoke-gate split) documented in ADR-001.

Commit:
```bash
git add .github/workflows/update-visual-goldens.yml .github/workflows/ci.yml
git commit -m "ci(visual): clean-before-regen + document theme-matrix scope + escape hatch"
```

- [ ] **Step 2: Push the branch (needed so workflow_dispatch can target it)**

```bash
git push -u origin worktree-visual-theme-matrix
```

- [ ] **Step 3: Trigger the canonical golden regen on this branch**

Run: `gh workflow run update-visual-goldens.yml --ref worktree-visual-theme-matrix`
Then poll:
Run: `gh run list --workflow "Update visual goldens" --branch worktree-visual-theme-matrix --json status,conclusion,databaseId --limit 3`
Expected: loop until `status == completed` / `conclusion == success`. (This run is the long one — full matrix, serial tiers. Budget generously; GitHub's job ceiling is 6h.)

- [ ] **Step 4: Download + unpack the canonical goldens**

```bash
RUN_ID=$(gh run list --workflow "Update visual goldens" --branch worktree-visual-theme-matrix \
  --json databaseId,conclusion --jq 'map(select(.conclusion=="success"))[0].databaseId')
gh run download "$RUN_ID" -n visual-goldens -D /tmp/vg-artifact
# The artifact preserves the packages/client-react/... path prefix; copy react/ sets in.
rsync -a --delete /tmp/vg-artifact/packages/client-react/tests/ui/visual/playwright/__screenshots__/react/ \
  packages/client-react/tests/ui/visual/playwright/__screenshots__/react/
rsync -a --delete /tmp/vg-artifact/packages/client-react/tests/ui/visual/vitest-browser/__screenshots__/react/ \
  packages/client-react/tests/ui/visual/vitest-browser/__screenshots__/react/
rsync -a --delete /tmp/vg-artifact/packages/client-react/tests/ui/visual/playwright-ct/__screenshots__/react/ \
  packages/client-react/tests/ui/visual/playwright-ct/__screenshots__/react/
```
(Verify the artifact's internal path with `find /tmp/vg-artifact -maxdepth 6 -type d -name react` before rsync; adjust the source prefix if the upload flattened it.)

- [ ] **Step 5: USER REVIEW CHECKPOINT — live-accept a sample**

Surface a representative sample of NEW theme goldens to the user (e.g. `holo3d-light/app-fx.png`, `terminal-dark/app-credit.png`, `terminal3d-light/app-admin.png`, plus a themed tile and blotter). Broad UI rounds require user live-acceptance BEFORE merge (memory: `project_v2_fidelity_workstream`). Do not proceed to commit until the user confirms the skins render as intended.

- [ ] **Step 6: Commit the canonical set**

```bash
git add packages/client-react/tests/ui/visual/*/__screenshots__/react
git commit -m "test(visual): canonical x86 goldens for the theme matrix"
git push
```

---

### Task 6: Documentation + memory

**Files:**
- Modify: `packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md`
- Modify: `/Users/csx/.claude/projects/-Users-csx-workarea-dev-github-com-bettersoftware-io-ReactiveTraderCloudClone/memory/project_visual_goldens_dual_set.md` + `MEMORY.md` pointer

**Interfaces:** none.

- [ ] **Step 1: Document the matrix in ADR-001**

Add a section covering: (a) the 10-combo scope (5 skins × dark/light, neon excluded) and *why* neon is out; (b) the naming convention (`__<skin>-<mode>` suffix; bare = classic-dark baseline); (c) tier scope (full matrix on **all three** tiers; CT rewritten from 15 hand-written specs to one data-driven `matrix.spec.tsx`, and why that's safe); (d) the resolver seam (`themeSkin`/`themeMode` on `Scenario` → `resolveScenarioData`); (e) the **escape hatch** — how to curate (edit `MATRIX_SKINS`/`MATRIX_MODES`/`MATRIX_EXCLUDE`) and how to de-gate (split `visual` into a classic-dark smoke gate + on-demand full run), with the measured gate-time from Task 4/CI.

- [ ] **Step 2: Update memory**

Update `project_visual_goldens_dual_set.md`: the goldens now span the full theme matrix via the data-driven tiers; record the expander location, the naming convention, the CT-tier carve-out, the measured golden count + on-disk size + CI-gate wall-clock, and the escape hatch. Refresh the `MEMORY.md` one-liner.

- [ ] **Step 3: Commit**

```bash
git add packages/client-react/tests/ui/visual/ADR-001-visual-diff-tooling.md
git commit -m "docs(visual): ADR-001 theme-matrix scope, naming, tiers, escape hatch"
git push
```

Then follow `shipping-repo-changes` Rules 2-6: green CI on the matching SHA → catch up to `origin/main` if behind → merge with `--merge` → confirm on `origin/main` → remove the worktree.

---

## Self-Review

**Spec coverage:** ✅ Size/time analysis already delivered to the user; this plan implements the chosen "full matrix on all three tiers, theme sub-folder layout, keep as gate, document everything." Task 1 = seam; Task 2 = matrix (every base scenario replaced by its full 10-combo cross-product incl. classic-dark, neon excluded — the requested "almost all combinations") + shared `goldenPath` sub-folder routing; Task 3 = CT data-driven rewrite (full matrix on CT); Task 4 = local goldens (all 3 tiers, darwin-arm64, clean-before-regen); Task 5 = canonical goldens (clean-before-regen in the container) + gate + user acceptance; Task 6 = docs + escape hatch for later curation/de-gating.

**Placeholder scan:** No TBD/"handle edge cases"/uncoded steps — every code step shows the code; regen/CI steps show exact commands.

**Type consistency:** `Scenario` gains `themeSkin?`/`themeMode?` (Task 1) consumed by `resolveScenarioData` (Task 1) and produced by `expandThemeMatrix` (Task 2). `MATRIX_SKINS`/`MATRIX_MODES` names consistent across scenarios.ts, its test, and the ADR. `scenarioActionFor` name consistent across scenarioActions.ts and all three tier specs (playwright, vitest-browser, and the new CT `matrix.spec.tsx`). The `COMBO_SUFFIX` skin alternation (in the shared `goldenPath.ts`) matches `MATRIX_SKINS` verbatim and is reused by `scenarioActionFor` (no duplicate regex). All three tier specs consume the shared `goldenPath` + `scenarioActionFor`; the CT `fullPage`/`scenario-root` capture logic mirrors `playwright/visual.spec.ts` verbatim.

**Known risks to watch:** (1) The artifact path prefix in Task 5 Step 4 (`gh run download` may or may not preserve `packages/client-react/...`) — the plan says verify with `find` before rsync. All three tiers now change, so all three `react/` dirs will restage. (2) CT is the slowest tier (serial `workers:1`, per-mount render) — full matrix on CT is the dominant contributor to the larger gate wall-clock; measure in Task 4 Step 2 and record in the ADR. (3) `react-local/linux-arm64` goes stale until regenerated in the aarch64 sandbox (Task 4 Step 5) — CI's `react/` gate is unaffected.
