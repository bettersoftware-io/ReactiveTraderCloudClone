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

test("credit/new-rfq-submitting", async ({ mount }) => {
  // Submission in flight (seeded status:"submitting") → "Submitting…" disabled form.
  const c = await mount(<VisualScenario name="credit/new-rfq-submitting" />);
  await expect(c).toHaveScreenshot("new-rfq-submitting.png", { animations: "disabled" });
});

test("credit/new-rfq-confirmed", async ({ mount }) => {
  // Submission confirmed (seeded status:"confirmed") → the "RFQ Created" success view.
  const c = await mount(<VisualScenario name="credit/new-rfq-confirmed" />);
  await expect(c).toHaveScreenshot("new-rfq-confirmed.png", { animations: "disabled" });
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

// TradeTicket render arms (seeded through the seam, no interaction).
test("credit/sell-side-passed", async ({ mount }) => {
  // AB quote "passed" → the responded-view "Passed" arm.
  const c = await mount(<VisualScenario name="credit/sell-side-passed" />);
  await expect(c).toHaveScreenshot("sell-side-passed.png", { animations: "disabled" });
});

test("credit/sell-side-rfq-cancelled", async ({ mount }) => {
  // Responded quote on a Cancelled rfq → "RFQ Cancelled" (also the opacity-0.6 arm).
  const c = await mount(<VisualScenario name="credit/sell-side-rfq-cancelled" />);
  await expect(c).toHaveScreenshot("sell-side-rfq-cancelled.png", { animations: "disabled" });
});

test("credit/sell-side-rfq-expired", async ({ mount }) => {
  // Responded quote on an Expired rfq → "RFQ Expired".
  const c = await mount(<VisualScenario name="credit/sell-side-rfq-expired" />);
  await expect(c).toHaveScreenshot("sell-side-rfq-expired.png", { animations: "disabled" });
});

test("credit/sell-side-responded-fallback", async ({ mount }) => {
  // Accepted quote on an Open rfq → the "Responded" fallback arm.
  const c = await mount(<VisualScenario name="credit/sell-side-responded-fallback" />);
  await expect(c).toHaveScreenshot("sell-side-responded-fallback.png", { animations: "disabled" });
});

test("credit/sell-side-closed", async ({ mount }) => {
  // Still-pending ticket on a Closed rfq → the else-arm "Closed".
  const c = await mount(<VisualScenario name="credit/sell-side-closed" />);
  await expect(c).toHaveScreenshot("sell-side-closed.png", { animations: "disabled" });
});

test("credit/sell-side-cancelled-pending", async ({ mount }) => {
  // Still-pending ticket on a Cancelled rfq → the else-arm "Cancelled".
  const c = await mount(<VisualScenario name="credit/sell-side-cancelled-pending" />);
  await expect(c).toHaveScreenshot("sell-side-cancelled-pending.png", { animations: "disabled" });
});

test("credit/sell-side-expired-pending", async ({ mount }) => {
  // Still-pending ticket on an Expired rfq → the else-arm "Expired".
  const c = await mount(<VisualScenario name="credit/sell-side-expired-pending" />);
  await expect(c).toHaveScreenshot("sell-side-expired-pending.png", { animations: "disabled" });
});

test("credit/sell-side-no-instrument", async ({ mount }) => {
  // rfq.instrumentId has no matching instrument → the "Instrument #999" fallback.
  const c = await mount(<VisualScenario name="credit/sell-side-no-instrument" />);
  await expect(c).toHaveScreenshot("sell-side-no-instrument.png", { animations: "disabled" });
});

test("credit/blotter-empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/blotter-empty" />);
  await expect(c).toHaveScreenshot("blotter-empty.png", { animations: "disabled" });
});

test("credit/blotter-unresolved", async ({ mount }) => {
  // Accepted quote whose dealer/instrument don't resolve → the "Dealer N" +
  // empty CUSIP/Security fallback cells.
  const c = await mount(<VisualScenario name="credit/blotter-unresolved" />);
  await expect(c).toHaveScreenshot("blotter-unresolved.png", { animations: "disabled" });
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

test("credit/new-rfq-sell", async ({ mount, page }) => {
  // Click the Sell direction button → the selected-Sell var(--accent-negative) arm.
  const c = await mount(<VisualScenario name="credit/new-rfq-sell" />);
  await page.getByTestId("rfq-direction-Sell").click();
  await expect(c).toHaveScreenshot("new-rfq-sell.png", { animations: "disabled" });
});

test("credit/sell-side-price-entered", async ({ mount, page }) => {
  // Type a price into the active ticket → the enabled-Submit truthy arms
  // (cursor "pointer" / opacity 1).
  const c = await mount(<VisualScenario name="credit/sell-side-price-entered" />);
  await page.getByTestId("trade-ticket-price").fill("98.5");
  await expect(c).toHaveScreenshot("sell-side-price-entered.png", { animations: "disabled" });
});
