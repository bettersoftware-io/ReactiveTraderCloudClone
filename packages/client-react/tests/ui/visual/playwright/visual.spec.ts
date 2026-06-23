import { expect, test } from "@playwright/test";

import { scenarioActions } from "../scenarioActions";
import { scenarios } from "../shared/scenarios";

// Golden filename: scenario name with "/" → "-" (path-safe, stable).
function goldenName(scenario: string): string {
  return `${scenario.replace(/\//g, "-")}.png`;
}

for (const name of Object.keys(scenarios)) {
  const action = scenarioActions[name] ?? {};

  test(name, async ({ page }) => {
    // Theme and view-mode are seeded through the seam (per-fixture data.theme /
    // data.viewMode), so dark/light and chart/price scenarios are deterministic
    // without any localStorage involvement.
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

    const shot = goldenName(name);

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
