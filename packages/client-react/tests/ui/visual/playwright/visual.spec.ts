import { expect, test } from "@playwright/test";
import { goldenPathArray } from "@ui-visual-shared/goldenPath";
import { scenarioActionFor } from "@ui-visual-shared/scenarioActions";
import { scenarios } from "@ui-visual-shared/scenarios";

for (const [name, scenario] of Object.entries(scenarios)) {
  const action = scenarioActionFor(name);

  test(name, async ({ page }) => {
    // Theme and view-mode are seeded through the seam (per-fixture data.themeMode /
    // data.viewMode), so dark/light and chart/price scenarios are deterministic
    // without any localStorage involvement.

    // The boot sequence reads prefers-reduced-motion to skip its rAF canvas loop;
    // emulate it BEFORE navigating so only the deterministic chrome is rendered.
    if (action.reducedMotion) {
      await page.emulateMedia({ reducedMotion: "reduce" });
    }

    await page.goto(`/?scenario=${encodeURIComponent(name)}`);

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

    const shot = goldenPathArray(name, scenario);

    if (action.fullPage) {
      await expect(page).toHaveScreenshot(shot, {
        animations: "disabled",
        fullPage: true,
      });
    } else {
      await expect(page.getByTestId("scenario-root")).toHaveScreenshot(shot, {
        animations: "disabled",
      });
    }
  });
}
