import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("analytics/populated", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/populated" />);
  await expect(c).toHaveScreenshot("populated.png", { animations: "disabled" });
});

test("analytics/loading", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/loading" />);
  await expect(c).toHaveScreenshot("loading.png", { animations: "disabled" });
});

test("analytics/negative-pnl", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/negative-pnl" />);
  await expect(c).toHaveScreenshot("negative-pnl.png", {
    animations: "disabled",
  });
});

test("analytics/empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/empty" />);
  await expect(c).toHaveScreenshot("empty.png", { animations: "disabled" });
});

test("analytics/flat-positions", async ({ mount }) => {
  const c = await mount(<VisualScenario name="analytics/flat-positions" />);
  await expect(c).toHaveScreenshot("flat-positions.png", {
    animations: "disabled",
  });
});

test("analytics/millions", async ({ mount }) => {
  // Million-scale all-positive PnL → PnlValue/PairPnlBars "m" labels and a
  // PnlChart with no dashed zero line (all history values > 0).
  const c = await mount(<VisualScenario name="analytics/millions" />);
  await expect(c).toHaveScreenshot("millions.png", { animations: "disabled" });
});
