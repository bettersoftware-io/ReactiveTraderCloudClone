import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

import { scenarioActionFor } from "../scenarioActions";
import { goldenPath } from "../shared/goldenPath";
import { scenarios } from "../shared/scenarios";

// Tier 1 — Playwright component tests, data-driven over the SAME shared scenario
// manifest + interaction table as ../playwright/visual.spec.ts and
// ../vitest-browser/visual.spec.tsx, so all three tiers stay behaviourally in
// lock-step across the full theme matrix. Goldens route via playwright-ct.config.ts
// (CI `react/` vs local `react-local/<arch>/`), under this file's `matrix.spec.tsx/`
// dir, at `<skin>-<mode>/<base-name>.png` (shared goldenPath).

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
      await expect(page).toHaveScreenshot(`${goldenPath(name, scenario)}.png`, {
        animations: "disabled",
        fullPage: true,
      });
    } else {
      await expect(page.getByTestId("scenario-root")).toHaveScreenshot(
        `${goldenPath(name, scenario)}.png`,
        { animations: "disabled" },
      );
    }
  });
}
