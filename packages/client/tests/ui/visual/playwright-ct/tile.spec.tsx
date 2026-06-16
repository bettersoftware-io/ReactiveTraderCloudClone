import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("tile/eurusd-up", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/eurusd-up" />);
  await expect(c).toHaveScreenshot("eurusd-up.png", { animations: "disabled" });
});

test("tile/loading", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/loading" />);
  await expect(c).toHaveScreenshot("loading.png", { animations: "disabled" });
});

test("tile/eurusd-down", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/eurusd-down" />);
  await expect(c).toHaveScreenshot("eurusd-down.png", { animations: "disabled" });
});

test("tile/eurusd-flat", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/eurusd-flat" />);
  await expect(c).toHaveScreenshot("eurusd-flat.png", { animations: "disabled" });
});

test("tile/chart-down", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/chart-down" />);
  await expect(c).toHaveScreenshot("chart-down.png", { animations: "disabled" });
});

test("tile/chart-empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/chart-empty" />);
  await expect(c).toHaveScreenshot("chart-empty.png", { animations: "disabled" });
});
