import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("positions/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="positions/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("positions/negative", async ({ mount }) => {
  const c = await mount(<VisualScenario name="positions/negative" />);
  await expect(c).toHaveScreenshot("negative.png", { animations: "disabled" });
});

test("positions/empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="positions/empty" />);
  await expect(c).toHaveScreenshot("empty.png", { animations: "disabled" });
});
