import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("credit/blotter", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/blotter" />);
  await expect(c).toHaveScreenshot("blotter.png", { animations: "disabled" });
});

test("credit/sell-side", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/sell-side" />);
  await expect(c).toHaveScreenshot("sell-side.png", { animations: "disabled" });
});

test("credit/sell-side-active", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/sell-side-active" />);
  await expect(c).toHaveScreenshot("sell-side-active.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-responded", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/sell-side-responded" />);
  await expect(c).toHaveScreenshot("sell-side-responded.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/sell-side-empty" />);
  await expect(c).toHaveScreenshot("sell-side-empty.png", {
    animations: "disabled",
  });
});

// TradeTicket render arms (seeded through the seam, no interaction).
test("credit/sell-side-passed", async ({ mount }) => {
  // AB quote "passed" → the responded-view "Passed" arm.
  const c = await mount(<VisualScenario name="credit/sell-side-passed" />);
  await expect(c).toHaveScreenshot("sell-side-passed.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-rfq-cancelled", async ({ mount }) => {
  // Responded quote on a Cancelled rfq → "RFQ Cancelled" (also the opacity-0.6 arm).
  const c = await mount(
    <VisualScenario name="credit/sell-side-rfq-cancelled" />,
  );
  await expect(c).toHaveScreenshot("sell-side-rfq-cancelled.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-rfq-expired", async ({ mount }) => {
  // Responded quote on an Expired rfq → "RFQ Expired".
  const c = await mount(<VisualScenario name="credit/sell-side-rfq-expired" />);
  await expect(c).toHaveScreenshot("sell-side-rfq-expired.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-responded-fallback", async ({ mount }) => {
  // Accepted quote on an Open rfq → the "Responded" fallback arm.
  const c = await mount(
    <VisualScenario name="credit/sell-side-responded-fallback" />,
  );
  await expect(c).toHaveScreenshot("sell-side-responded-fallback.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-closed", async ({ mount }) => {
  // Still-pending ticket on a Closed rfq → the else-arm "Closed".
  const c = await mount(<VisualScenario name="credit/sell-side-closed" />);
  await expect(c).toHaveScreenshot("sell-side-closed.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-cancelled-pending", async ({ mount }) => {
  // Still-pending ticket on a Cancelled rfq → the else-arm "Cancelled".
  const c = await mount(
    <VisualScenario name="credit/sell-side-cancelled-pending" />,
  );
  await expect(c).toHaveScreenshot("sell-side-cancelled-pending.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-expired-pending", async ({ mount }) => {
  // Still-pending ticket on an Expired rfq → the else-arm "Expired".
  const c = await mount(
    <VisualScenario name="credit/sell-side-expired-pending" />,
  );
  await expect(c).toHaveScreenshot("sell-side-expired-pending.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-no-instrument", async ({ mount }) => {
  // rfq.instrumentId has no matching instrument → the "Instrument #999" fallback.
  const c = await mount(
    <VisualScenario name="credit/sell-side-no-instrument" />,
  );
  await expect(c).toHaveScreenshot("sell-side-no-instrument.png", {
    animations: "disabled",
  });
});

test("credit/blotter-empty", async ({ mount }) => {
  const c = await mount(<VisualScenario name="credit/blotter-empty" />);
  await expect(c).toHaveScreenshot("blotter-empty.png", {
    animations: "disabled",
  });
});

test("credit/blotter-unresolved", async ({ mount }) => {
  // Accepted quote whose dealer/instrument don't resolve → the "Dealer N" +
  // empty CUSIP/Security fallback cells.
  const c = await mount(<VisualScenario name="credit/blotter-unresolved" />);
  await expect(c).toHaveScreenshot("blotter-unresolved.png", {
    animations: "disabled",
  });
});

test("credit/sell-side-price-entered", async ({ mount, page }) => {
  // Type a price into the active ticket → the enabled-Submit truthy arms
  // (cursor "pointer" / opacity 1).
  const c = await mount(
    <VisualScenario name="credit/sell-side-price-entered" />,
  );
  await page.getByTestId("trade-ticket-price").fill("98.5");
  await expect(c).toHaveScreenshot("sell-side-price-entered.png", {
    animations: "disabled",
  });
});
