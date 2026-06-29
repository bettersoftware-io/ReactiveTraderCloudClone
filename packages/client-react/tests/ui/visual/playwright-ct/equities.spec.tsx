import { expect, test } from "@playwright/experimental-ct-react";
import { VisualScenario } from "@ui-visual";

test("equities/watchlist-loaded", async ({ mount }) => {
  // Watchlist with 6 instruments — AAPL row visible and active; varied
  // up/down heat tints render deterministically from fixed changePct values.
  const c = await mount(<VisualScenario name="equities/watchlist-loaded" />);
  await expect(c.getByTestId("watchlist-row-AAPL")).toBeVisible();
  await expect(c).toHaveScreenshot("watchlist-loaded.png", {
    animations: "disabled",
  });
});

test("equities/sector-heatmap", async ({ mount }) => {
  // Heatmap cells grouped by sector; AAPL cell is active (border-accent).
  // Up/down heat colours derived from the fixed quote changePct values.
  const c = await mount(<VisualScenario name="equities/sector-heatmap" />);
  await expect(c.getByTestId("heatmap-cell-AAPL")).toBeVisible();
  await expect(c).toHaveScreenshot("sector-heatmap.png", {
    animations: "disabled",
  });
});

test("equities/chart-loaded", async ({ mount }) => {
  // PriceChart canvas rendered with 40 AAPL candles inside a fixed 400×200
  // container. Canvas draws via useLayoutEffect (sync with layout); the aria-label
  // confirms the canvas element is in the DOM.
  const c = await mount(<VisualScenario name="equities/chart-loaded" />);
  await expect(c.locator('[aria-label="AAPL price chart"]')).toBeVisible();
  await expect(c).toHaveScreenshot("chart-loaded.png", {
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

test("equities/positions-with-pnl", async ({ mount }) => {
  // PositionsBlotter: DeskPnlGauge arc + 4 positions with mixed P&L signs
  // (AAPL/MSFT positive, JPM negative, XOM positive). PnlSparkline bars
  // extend left (neg) / right (pos) from the centre line.
  const c = await mount(<VisualScenario name="equities/positions-with-pnl" />);
  await expect(c.getByTestId("position-row-AAPL")).toBeVisible();
  await expect(c).toHaveScreenshot("positions-with-pnl.png", {
    animations: "disabled",
  });
});

test("equities/panel", async ({ mount }) => {
  // Full EquitiesPanel at 1280×680 — tabs, watchlist, heatmap, price chart,
  // order ticket, depth ladder, orders blotter (default view) all in one shot.
  const c = await mount(<VisualScenario name="equities/panel" />);
  await expect(c.getByText("WATCHLIST")).toBeVisible();
  await expect(c).toHaveScreenshot("panel.png", { animations: "disabled" });
});
