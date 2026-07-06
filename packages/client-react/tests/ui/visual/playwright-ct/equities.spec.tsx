import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("equities/sector-heatmap", async ({ mount }) => {
  // Heatmap cells grouped by sector; AAPL cell is active (border-accent).
  // Up/down heat colours derived from the fixed quote changePct values.
  const c = await mount(<VisualScenario name="equities/sector-heatmap" />);
  await expect(c.getByTestId("heatmap-cell-AAPL")).toBeVisible();
  await expect(c).toHaveScreenshot("sector-heatmap.png", {
    animations: "disabled",
  });
});

test("equities/depth-ladder", async ({ mount }) => {
  // Depth ladder with 8 asks + 8 bids for AAPL. The "ASKS" section label
  // proves the book rendered (null → "NO DEPTH DATA" branch not taken).
  const c = await mount(<VisualScenario name="equities/depth-ladder" />);
  await expect(c.getByText("ASKS")).toBeVisible();
  await expect(c).toHaveScreenshot("depth-ladder.png", {
    animations: "disabled",
  });
});

test("equities/ticket-editing", async ({ mount }) => {
  // OrderTicket in editing phase: BUY/SELL toggles, MARKET/LIMIT toggles,
  // quantity input seeded to 100, and a "BUY AAPL" submit button.
  const c = await mount(<VisualScenario name="equities/ticket-editing" />);
  await expect(c.getByTestId("order-ticket")).toBeVisible();
  await expect(c).toHaveScreenshot("ticket-editing.png", {
    animations: "disabled",
  });
});

test("equities/ticket-filled", async ({ mount }) => {
  // OrderTicket in filled phase: "FILLED — 100 @ 178.50" status line
  // and a "NEW ORDER" reset button.
  const c = await mount(<VisualScenario name="equities/ticket-filled" />);
  await expect(c.getByText(/FILLED/)).toBeVisible();
  await expect(c).toHaveScreenshot("ticket-filled.png", {
    animations: "disabled",
  });
});
