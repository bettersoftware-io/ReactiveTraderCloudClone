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

// --- Task 7: four-panel-dock replacement scenarios ---

test("equities/chart-panel", async ({ mount }) => {
  // ChartPanel body only (the instrument-tabs strip lives in EqChartHead, the
  // panel's separate headControls slot — not part of ChartPanel itself, same
  // split as LiveRatesPanel/LiveRatesHead): instrument header (AAPL) +
  // candlestick plot, seeded via equitiesBase's equityWorkspace (sel "AAPL").
  const c = await mount(<VisualScenario name="equities/chart-panel" />);
  await expect(c.getByTestId("instrument-header")).toBeVisible();
  await expect(c.getByTestId("instrument-header-last")).toHaveText("178.50");
  await expect(c).toHaveScreenshot("chart-panel.png", {
    animations: "disabled",
  });
});

test("equities/instrument-header", async ({ mount }) => {
  // Standalone InstrumentHeader with a forced flashOn=true/dir="up" — the
  // tick-flash accent arm a static ChartPanel capture can never reach.
  const c = await mount(<VisualScenario name="equities/instrument-header" />);
  await expect(c.getByTestId("instrument-header-last")).toHaveAttribute(
    "data-flash",
    "true",
  );
  await expect(c).toHaveScreenshot("instrument-header.png", {
    animations: "disabled",
  });
});

test("equities/watchlist-loaded", async ({ mount }) => {
  // Default sort (unset → "chg"); AAPL row is data-selected (workspace sel).
  const c = await mount(<VisualScenario name="equities/watchlist-loaded" />);
  await expect(c.getByTestId("watch-row-AAPL")).toHaveAttribute(
    "data-selected",
    "true",
  );
  await expect(c).toHaveScreenshot("watchlist-loaded.png", {
    animations: "disabled",
  });
});

test("equities/watchlist-sort-sym", async ({ mount }) => {
  const c = await mount(<VisualScenario name="equities/watchlist-sort-sym" />);
  await expect(c.getByTestId("watch-row-AAPL")).toBeVisible();
  await expect(c).toHaveScreenshot("watchlist-sort-sym.png", {
    animations: "disabled",
  });
});

test("equities/watchlist-sort-price", async ({ mount }) => {
  const c = await mount(
    <VisualScenario name="equities/watchlist-sort-price" />,
  );
  await expect(c.getByTestId("watch-row-AAPL")).toBeVisible();
  await expect(c).toHaveScreenshot("watchlist-sort-price.png", {
    animations: "disabled",
  });
});

test("equities/blotter-orders", async ({ mount }) => {
  // Default view (unset → "orders"): the 5 seeded equityOrders render.
  const c = await mount(<VisualScenario name="equities/blotter-orders" />);
  await expect(c.getByTestId("order-row-ord-001")).toBeVisible();
  await expect(c).toHaveScreenshot("blotter-orders.png", {
    animations: "disabled",
  });
});

test("equities/blotter-positions", async ({ mount }) => {
  // eqBlotterView "positions": the 4 seeded equityPositions + DeskPnlGauge.
  const c = await mount(<VisualScenario name="equities/blotter-positions" />);
  await expect(c.getByTestId("position-row-AAPL")).toBeVisible();
  await expect(c).toHaveScreenshot("blotter-positions.png", {
    animations: "disabled",
  });
});
