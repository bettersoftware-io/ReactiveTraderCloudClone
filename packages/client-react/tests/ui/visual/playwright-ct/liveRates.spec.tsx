import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("live-rates/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="live-rates/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("live-rates/price-view", async ({ mount, page }) => {
  // Price view is seeded through the seam (fixture viewMode "price"); confirm the
  // button offers switching back ("Chart" label) before screenshotting.
  const c = await mount(<VisualScenario name="live-rates/price-view" />);
  await expect(page.getByText("Chart")).toBeVisible();
  await expect(c).toHaveScreenshot("price-view.png", {
    animations: "disabled",
  });
});
