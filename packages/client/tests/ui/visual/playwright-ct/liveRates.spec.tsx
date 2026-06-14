import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("live-rates/populated", async ({ mount, page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  const c = await mount(<VisualScenario name="live-rates/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});
