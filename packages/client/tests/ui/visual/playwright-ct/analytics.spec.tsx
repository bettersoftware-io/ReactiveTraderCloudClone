import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("analytics/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("analytics/loading", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/loading" />);
  await expect(c).toHaveScreenshot("loading.png", { animations: "disabled" });
});
