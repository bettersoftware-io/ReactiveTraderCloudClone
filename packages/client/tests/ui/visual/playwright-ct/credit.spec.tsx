import { test, expect } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("credit/rfq-tiles", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/rfq-tiles" />);
  await expect(c).toHaveScreenshot("rfq-tiles.png", { animations: "disabled" });
});

test("credit/new-rfq", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/new-rfq" />);
  await expect(c).toHaveScreenshot("new-rfq.png", { animations: "disabled" });
});

test("credit/blotter", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/blotter" />);
  await expect(c).toHaveScreenshot("blotter.png", { animations: "disabled" });
});

test("credit/sell-side", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/sell-side" />);
  await expect(c).toHaveScreenshot("sell-side.png", { animations: "disabled" });
});
