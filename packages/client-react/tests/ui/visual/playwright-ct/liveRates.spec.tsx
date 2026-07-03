import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("live-rates/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="live-rates/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("live-rates/price-view", async ({ mount }) => {
  // Price view is seeded through the seam (fixture viewMode "price") — no
  // interaction needed. The CHARTS toggle that used to live inline (and read
  // "Chart" when offering a switch back) moved to the fx-rates panel's head
  // slot (LiveRatesHead), outside this standalone component; the screenshot
  // alone proves the price-mode arm (charts suppressed) rendered.
  const c = await mount(<VisualScenario name="live-rates/price-view" />);
  await expect(c).toHaveScreenshot("price-view.png", {
    animations: "disabled",
  });
});
