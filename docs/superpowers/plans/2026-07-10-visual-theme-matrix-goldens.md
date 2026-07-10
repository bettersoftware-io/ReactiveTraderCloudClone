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
- **Naming:** derived scenario key = `` `${base}__${skin}-${mode}` ``; golden basename = that with `/`→`-` (e.g. `app-fx__holo3d-light.png`). `classic-dark` is NOT suffixed — the bare golden (`app-fx.png`) is the classic-dark baseline. The rewritten CT tier adopts this same scenario-derived naming (retiring the old bespoke `fx.png`/`blotter.png` names) under a single `matrix.spec.tsx/` dir.
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

### Task 2: Theme-matrix expander + action resolver

**Files:**
- Modify: `packages/client-react/tests/ui/visual/shared/scenarios.ts` (rename literal to `baseScenarios`, add expander + exports)
- Modify: `packages/client-react/tests/ui/visual/scenarioActions.ts` (add `scenarioActionFor`)
- Modify: `packages/client-react/tests/ui/visual/playwright/visual.spec.ts:12` (use `scenarioActionFor`)
- Modify: `packages/client-react/tests/ui/visual/vitest-browser/visual.spec.tsx:39` (use `scenarioActionFor`)
- Test: `packages/client-react/tests/ui/visual/shared/scenarios.test.ts`

**Interfaces:**
- Consumes: `Scenario` (Task 1).
- Produces:
  - `MATRIX_SKINS: readonly ThemeSkin[]`, `MATRIX_MODES: readonly ThemeMode[]`.
  - `scenarios: Record<string, Scenario>` — base scenarios plus 9 combos each (all combos except `classic-dark`), skipping `MATRIX_EXCLUDE`.
  - `scenarioActionFor(name: string): ScenarioAction` — maps a derived name (`app/credit__holo-dark`) back to its base action (`app/credit`).

- [ ] **Step 1: Write the failing test for the expander**

Create `shared/scenarios.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { MATRIX_MODES, MATRIX_SKINS, scenarios } from "./scenarios";

describe("theme-matrix expansion", () => {
  it("adds a themed combo for a non-classic-dark skin/mode", () => {
    expect(scenarios["app/fx__holo3d-light"]).toEqual({
      componentKey: "App",
      fixtureKey: "app-fx",
      themeSkin: "holo3d",
      themeMode: "light",
    });
  });

  it("keeps the bare scenario as the classic-dark baseline (no __classic-dark key)", () => {
    expect(scenarios["app/fx"]).toEqual({ componentKey: "App", fixtureKey: "app-fx" });
    expect(scenarios["app/fx__classic-dark"]).toBeUndefined();
  });

  it("does not expand mode-cycle assertion scenarios", () => {
    expect(scenarios["app/fx-light"]).toBeDefined();
    expect(scenarios["app/fx-light__holo-dark"]).toBeUndefined();
  });

  it("excludes neon and yields 9 combos per expandable base", () => {
    expect(MATRIX_SKINS).not.toContain("neon");
    // 5 skins × 2 modes − classic-dark = 9 extra combos.
    const combosForAppFx = Object.keys(scenarios).filter((k) =>
      k.startsWith("app/fx__"),
    );
    expect(combosForAppFx).toHaveLength(MATRIX_SKINS.length * MATRIX_MODES.length - 1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @rtc/client-react exec vitest run tests/ui/visual/shared/scenarios.test.ts`
Expected: FAIL — `MATRIX_SKINS`/`MATRIX_MODES` not exported; `app/fx__holo3d-light` undefined.

- [ ] **Step 3: Add the expander to `shared/scenarios.ts`**

Rename the existing `export const scenarios: Record<string, Scenario> = { … }` literal to `const baseScenarios: Record<string, Scenario> = { … }` (change only that one declaration line; leave every entry as-is). Then append, after the literal, using the `ThemeMode`/`ThemeSkin` types already imported in Task 1 (add `ThemeMode` to that import):

```ts
// The theme matrix: every skin except neon × dark/light. The bare (un-suffixed)
// scenarios ARE the classic-dark baseline (default fixture skin/mode), so the
// expander skips that combo — no duplicate golden, no churn on existing shots.
export const MATRIX_SKINS = [
  "classic",
  "holo",
  "holo3d",
  "terminal",
  "terminal3d",
] as const satisfies readonly ThemeSkin[];
export const MATRIX_MODES = ["dark", "light"] as const satisfies readonly ThemeMode[];

// Base scenarios whose scenarioAction asserts a mode-cycle-specific theme-toggle
// aria-label — expanding these across modes would break that assertion, and they
// exist to prove the mode cycle, not the skin matrix. Left un-expanded.
const MATRIX_EXCLUDE = new Set<string>(["app/fx-light", "app/fx-system"]);

function expandThemeMatrix(
  base: Record<string, Scenario>,
): Record<string, Scenario> {
  const out: Record<string, Scenario> = { ...base };
  for (const [name, scenario] of Object.entries(base)) {
    if (MATRIX_EXCLUDE.has(name)) continue;
    for (const skin of MATRIX_SKINS) {
      for (const mode of MATRIX_MODES) {
        if (skin === "classic" && mode === "dark") continue; // bare == classic-dark
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

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @rtc/client-react exec vitest run tests/ui/visual/shared/scenarios.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Add `scenarioActionFor` to `scenarioActions.ts`**

At the end of `scenarioActions.ts`, add (the regex skin list must match `MATRIX_SKINS`):

```ts
// Matches a matrix-expanded name's `__<skin>-<mode>` suffix so derived
// scenarios reuse their base action (interaction/waitForText). See
// shared/scenarios.ts expandThemeMatrix.
const COMBO_SUFFIX =
  /__(?:classic|holo|holo3d|terminal|terminal3d)-(?:dark|light)$/;

/** Resolve the capture action for a scenario, mapping matrix-expanded names
 *  (`app/credit__holo-dark`) back to their base action (`app/credit`). */
export function scenarioActionFor(name: string): ScenarioAction {
  return (
    scenarioActions[name] ??
    scenarioActions[name.replace(COMBO_SUFFIX, "")] ??
    {}
  );
}
```

- [ ] **Step 6: Point both data-driven specs at `scenarioActionFor`**

In `playwright/visual.spec.ts`: change the import to add `scenarioActionFor` and replace line 12:

```ts
import { scenarioActionFor } from "../scenarioActions";
```
```ts
  const action = scenarioActionFor(name);
```

In `vitest-browser/visual.spec.tsx`: same — import `scenarioActionFor`, and replace line 39:

```ts
import { scenarioActionFor } from "../scenarioActions";
```
```ts
  const action = scenarioActionFor(name);
```

(Both files currently `import { scenarioActions } from "../scenarioActions";` — swap it for the new named import; `scenarioActions` itself is no longer referenced in the specs.)

- [ ] **Step 7: Typecheck + lint + commit**

Run: `pnpm --filter @rtc/client-react typecheck`
Run: `pnpm --filter @rtc/client-react exec biome check tests/ui/visual/shared/scenarios.ts tests/ui/visual/scenarioActions.ts`
Expected: both PASS.

```bash
git add packages/client-react/tests/ui/visual/shared/scenarios.ts \
        packages/client-react/tests/ui/visual/shared/scenarios.test.ts \
        packages/client-react/tests/ui/visual/scenarioActions.ts \
        packages/client-react/tests/ui/visual/playwright/visual.spec.ts \
        packages/client-react/tests/ui/visual/vitest-browser/visual.spec.tsx
git commit -m "test(visual): theme-matrix expander (5 skins × dark/light, neon excluded)"
```

---

### Task 3: Rewrite the playwright-ct tier to be data-driven

**Files:**
- Create: `packages/client-react/tests/ui/visual/playwright-ct/matrix.spec.tsx`
- Delete: the 15 hand-written CT specs — `admin.spec.tsx`, `admin-dashboard.spec.tsx`, `analytics.spec.tsx`, `app.spec.tsx`, `connection.spec.tsx`, `credit.spec.tsx`, `equities.spec.tsx`, `fxBlotter.spec.tsx`, `layout.spec.tsx`, `liveRates.spec.tsx`, `overlay.spec.tsx`, `positions.spec.tsx`, `shell.spec.tsx`, `stale.spec.tsx`, `tile.spec.tsx`
- Delete (regenerated under `matrix.spec.tsx/` in Tasks 4-5): the old bespoke CT golden dirs `packages/client-react/tests/ui/visual/playwright-ct/__screenshots__/{react,react-local/*}/{admin,admin-dashboard,analytics,app,connection,credit,equities,fxBlotter,layout,liveRates,overlay,positions,shell,stale,tile}.spec.tsx/`

**Interfaces:**
- Consumes: `scenarios` (Task 2), `scenarioActionFor` (Task 2), `VisualScenario` (`@ui-visual`).
- Produces: CT goldens named `<scenario with / → ->.png` under `matrix.spec.tsx/` — same naming as the plain-Playwright tier.

**Why safe:** every deleted CT test just mounted `VisualScenario name="<scenario-key>"`; all those keys are in `scenarios`. Tiers 2 & 3 already loop *all* scenarios (incl. `admin/panel-loading`, `equities-*`) with no `waitForText` and pass in CI — so dropping the hand-written per-spec text asserts is provably safe (`toHaveScreenshot` stability retry + `fontsReady` + `animations:disabled` are the settle barrier). The `beforeEach` below preserves the two real CT quirks (localStorage clear + the `**/throughput` stub the old `app/admin` test used).

- [ ] **Step 1: Create the data-driven CT spec**

Create `playwright-ct/matrix.spec.tsx`:

```tsx
import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

import { scenarioActionFor } from "../scenarioActions";
import { scenarios } from "../shared/scenarios";

// Tier 1 — Playwright component tests, data-driven over the SAME shared scenario
// manifest + interaction table as ../playwright/visual.spec.ts and
// ../vitest-browser/visual.spec.tsx, so all three tiers stay behaviourally in
// lock-step across the full theme matrix. Goldens route via playwright-ct.config.ts
// (CI `react/` vs local `react-local/<arch>/`), under this file's `matrix.spec.tsx/`
// dir, named `<scenario with / → ->.png`.
function goldenName(scenario: string): string {
  return `${scenario.replace(/\//g, "-")}.png`;
}

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

for (const name of Object.keys(scenarios)) {
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
      await expect(page).toHaveScreenshot(goldenName(name), {
        animations: "disabled",
        fullPage: true,
      });
    } else {
      await expect(page.getByTestId("scenario-root")).toHaveScreenshot(
        goldenName(name),
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
Expected: PASS — writes `react-local/<arch>/matrix.spec.tsx/app-fx__terminal-light.png`. (Full CT regen happens in Task 4.)

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

- [ ] **Step 2: Regenerate all three local tiers**

Run: `pnpm --filter @rtc/client-react test:ui:visual:playwright-ct:react:update`
Run: `pnpm --filter @rtc/client-react test:ui:visual:playwright:react:update`
Run: `pnpm --filter @rtc/client-react test:ui:visual:vitest-browser:react:update`
Expected: ~1222 goldens per tier written under `react-local/darwin-arm64/` (CT now under `matrix.spec.tsx/`). Note the wall-clock of each — this is the CI-gate estimate.

- [ ] **Step 3: Sanity-check a themed golden differs from the classic-dark baseline**

Run: `open packages/client-react/tests/ui/visual/playwright/__screenshots__/react-local/darwin-arm64/visual.spec.ts/app-fx.png packages/client-react/tests/ui/visual/playwright/__screenshots__/react-local/darwin-arm64/visual.spec.ts/app-fx__terminal-light.png`
Expected: visibly different skins (classic-dark blue vs terminal-light amber-on-light).

- [ ] **Step 4: Confirm the local gate passes end-to-end**

Run: `pnpm --filter @rtc/client-react test:ui:visual`
Expected: all three tiers PASS against the freshly-written darwin-arm64 goldens.

- [ ] **Step 5: Commit the darwin-arm64 set + note the linux-arm64 follow-up**

The stale/orphaned `react-local/linux-arm64/` goldens (old CT spec dirs + missing matrix combos) will make the local gate red on an aarch64 box until regenerated there. Regenerate them in the sandbox with the same three `:update` commands, or leave a documented follow-up (Task 6). Stage the darwin set and the deletions of the retired CT golden dirs:

```bash
git add packages/client-react/tests/ui/visual/*/__screenshots__/react-local
git commit -m "test(visual): darwin-arm64 local goldens for the theme matrix (all 3 tiers)"
```

---

### Task 5: Bake the canonical `react/` goldens in CI + review

**Files:**
- Modify: `.github/workflows/update-visual-goldens.yml` (header comment: note the theme matrix; no behavioural change needed)
- Modify: `.github/workflows/ci.yml` (comment on the larger `visual` job + escape hatch; no behavioural change)
- Regenerate (via CI artifact): all three tiers' canonical sets — `packages/client-react/tests/ui/visual/{playwright-ct,playwright,vitest-browser}/__screenshots__/react/**` (CT now full-matrix under `matrix.spec.tsx/`, replacing the retired bespoke spec dirs)

**Interfaces:** none.

- [ ] **Step 1: Annotate the workflows (documentation only)**

In `update-visual-goldens.yml`, extend the top comment block to note it now regenerates the full theme matrix across all three tiers (CT is now data-driven under `matrix.spec.tsx`), and that the run is substantially longer.

In `ci.yml`'s `visual` job, add a comment above the `Visual diffs` step recording that the matrix makes this the critical-path job (~measure after first run) and pointing to the escape hatch (smoke-gate split) documented in ADR-001.

Commit:
```bash
git add .github/workflows/update-visual-goldens.yml .github/workflows/ci.yml
git commit -m "ci(visual): document theme-matrix scope + gate-time escape hatch"
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

Surface a representative sample of NEW theme goldens to the user (e.g. `app-fx__holo3d-light`, `app-credit__terminal-dark`, `app-admin__terminal3d-light`, a themed tile and blotter). Broad UI rounds require user live-acceptance BEFORE merge (memory: `project_v2_fidelity_workstream`). Do not proceed to commit until the user confirms the skins render as intended.

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

**Spec coverage:** ✅ Size/time analysis already delivered to the user; this plan implements the chosen "full matrix on all three tiers, keep as gate, document everything." Task 1 = seam; Task 2 = matrix (all scenarios × 9 combos + classic-dark baseline, neon excluded — the requested "almost all combinations"); Task 3 = CT data-driven rewrite (full matrix on CT); Task 4 = local goldens (all 3 tiers, darwin-arm64); Task 5 = canonical goldens + gate + user acceptance; Task 6 = docs + escape hatch for later curation/de-gating.

**Placeholder scan:** No TBD/"handle edge cases"/uncoded steps — every code step shows the code; regen/CI steps show exact commands.

**Type consistency:** `Scenario` gains `themeSkin?`/`themeMode?` (Task 1) consumed by `resolveScenarioData` (Task 1) and produced by `expandThemeMatrix` (Task 2). `MATRIX_SKINS`/`MATRIX_MODES` names consistent across scenarios.ts, its test, and the ADR. `scenarioActionFor` name consistent across scenarioActions.ts and all three tier specs (playwright, vitest-browser, and the new CT `matrix.spec.tsx`). The `COMBO_SUFFIX` skin alternation matches `MATRIX_SKINS` verbatim. The CT `goldenName`/`fullPage`/`scenario-root` capture logic mirrors `playwright/visual.spec.ts` verbatim.

**Known risks to watch:** (1) The artifact path prefix in Task 5 Step 4 (`gh run download` may or may not preserve `packages/client-react/...`) — the plan says verify with `find` before rsync. All three tiers now change, so all three `react/` dirs will restage. (2) CT is the slowest tier (serial `workers:1`, per-mount render) — full matrix on CT is the dominant contributor to the larger gate wall-clock; measure in Task 4 Step 2 and record in the ADR. (3) `react-local/linux-arm64` goes stale until regenerated in the aarch64 sandbox (Task 4 Step 5) — CI's `react/` gate is unaffected.
