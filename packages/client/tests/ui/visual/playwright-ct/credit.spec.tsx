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

test("credit/rfq-tiles-done", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/rfq-tiles-done" />);
  await expect(c).toHaveScreenshot("rfq-tiles-done.png", { animations: "disabled" });
});

test("credit/rfq-tiles-expired", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/rfq-tiles-expired" />);
  await expect(c).toHaveScreenshot("rfq-tiles-expired.png", { animations: "disabled" });
});

test("credit/rfq-tiles-cancelled", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/rfq-tiles-cancelled" />);
  await expect(c).toHaveScreenshot("rfq-tiles-cancelled.png", { animations: "disabled" });
});

test("credit/rfq-tiles-accepted", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/rfq-tiles-accepted" />);
  await expect(c).toHaveScreenshot("rfq-tiles-accepted.png", { animations: "disabled" });
});

test("credit/rfq-tiles-passed", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/rfq-tiles-passed" />);
  await expect(c).toHaveScreenshot("rfq-tiles-passed.png", { animations: "disabled" });
});

test("credit/rfq-tiles-empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/rfq-tiles-empty" />);
  await expect(c).toHaveScreenshot("rfq-tiles-empty.png", { animations: "disabled" });
});

test("credit/sell-side-active", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/sell-side-active" />);
  await expect(c).toHaveScreenshot("sell-side-active.png", { animations: "disabled" });
});

test("credit/sell-side-responded", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/sell-side-responded" />);
  await expect(c).toHaveScreenshot("sell-side-responded.png", { animations: "disabled" });
});

test("credit/sell-side-empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/sell-side-empty" />);
  await expect(c).toHaveScreenshot("sell-side-empty.png", { animations: "disabled" });
});

test("credit/blotter-empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/blotter-empty" />);
  await expect(c).toHaveScreenshot("blotter-empty.png", { animations: "disabled" });
});

test("credit/workspace-new-rfq", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="credit/workspace-new-rfq" />);
  await page.getByTestId("credit-tab-new-rfq").click();
  await expect(page.getByText("Submit RFQ")).toBeVisible();
  await expect(c).toHaveScreenshot("workspace-new-rfq.png", { animations: "disabled" });
});

test("credit/workspace-sell-side", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="credit/workspace-sell-side" />);
  await page.getByTestId("credit-tab-sell-side").click();
  await expect(page.getByText("Sell Side (Adaptive Bank)")).toBeVisible();
  await expect(c).toHaveScreenshot("workspace-sell-side.png", { animations: "disabled" });
});

test("credit/rfq-tiles-all", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="credit/rfq-tiles-all" />);
  await page.getByTestId("rfq-filter-All").click();
  await expect(c).toHaveScreenshot("rfq-tiles-all.png", { animations: "disabled" });
});

test("credit/new-rfq-search-open", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="credit/new-rfq-search-open" />);
  await page.getByTestId("instrument-search-input").fill("Treasury");
  await expect(page.getByText("CUSIP: 912828ZQ6")).toBeVisible();
  await expect(c).toHaveScreenshot("new-rfq-search-open.png", { animations: "disabled" });
});

test("credit/new-rfq-instrument-selected", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="credit/new-rfq-instrument-selected" />);
  await page.getByTestId("instrument-search-input").fill("Treasury");
  await page.getByTestId("instrument-result-1").click();
  await expect(page.getByText("Coupon: 1.5%")).toBeVisible();
  await expect(c).toHaveScreenshot("new-rfq-instrument-selected.png", { animations: "disabled" });
});

test("credit/new-rfq-filled", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="credit/new-rfq-filled" />);
  await page.getByTestId("instrument-search-input").fill("Treasury");
  await page.getByTestId("instrument-result-1").click();
  await page.getByTestId("quantity-input").fill("5000");
  await expect(c).toHaveScreenshot("new-rfq-filled.png", { animations: "disabled" });
});

test("credit/new-rfq-invalid", async ({ mount, page }) => {
  const c = await mount(<VisualScenario name="credit/new-rfq-invalid" />);
  await page.getByTestId("instrument-search-input").fill("Treasury");
  await page.getByTestId("instrument-result-1").click();
  await page.getByTestId("quantity-input").fill("200000000");
  await expect(page.getByText("Max quantity exceeded")).toBeVisible();
  await expect(c).toHaveScreenshot("new-rfq-invalid.png", { animations: "disabled" });
});
