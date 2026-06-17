import { test, expect } from "@playwright/test";
import { scenarios } from "../shared/scenarios";
import { scenarioActions } from "../scenarioActions";

// Golden filename: scenario name with "/" → "-" (path-safe, stable).
const goldenName = (scenario: string) => `${scenario.replace(/\//g, "-")}.png`;

for (const name of Object.keys(scenarios)) {
  const action = scenarioActions[name] ?? {};

  test(name, async ({ page }) => {
    // Theme persists to localStorage (rtc-theme); clear it so dark/light
    // scenarios are deterministic regardless of run order or a reused context.
    await page.addInitScript(() => window.localStorage.clear());

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
