import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-harness";

test("tile/eurusd-up", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/eurusd-up" />);
  await expect(c).toHaveScreenshot("eurusd-up.png", { animations: "disabled" });
});

test("tile/loading", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/loading" />);
  await expect(c).toHaveScreenshot("loading.png", { animations: "disabled" });
});
