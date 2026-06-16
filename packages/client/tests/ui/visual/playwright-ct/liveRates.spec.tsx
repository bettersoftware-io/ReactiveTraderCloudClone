import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("live-rates/populated", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  const c = await mount(<VisualScenario name="live-rates/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("live-rates/price-view", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  const c = await mount(<VisualScenario name="live-rates/price-view" />);
  // Default view is chart; toggle to price view, then confirm the button now
  // offers switching back ("Chart" label) before screenshotting.
  await page.getByTestId("view-toggle").click();
  await expect(page.getByText("Chart")).toBeVisible();
  await expect(c).toHaveScreenshot("price-view.png", { animations: "disabled" });
});
