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

// --- Phase 9: tile execution confirmation arms (TileConfirmation overlay) ---
test("tile/execution-started", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/execution-started" />);
  await expect(c).toHaveScreenshot("execution-started.png", { animations: "disabled" });
});

test("tile/execution-too-long", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/execution-too-long" />);
  await expect(c).toHaveScreenshot("execution-too-long.png", { animations: "disabled" });
});

test("tile/execution-timeout", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/execution-timeout" />);
  await expect(c).toHaveScreenshot("execution-timeout.png", { animations: "disabled" });
});

test("tile/execution-done", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/execution-done" />);
  await expect(c).toHaveScreenshot("execution-done.png", { animations: "disabled" });
});

test("tile/execution-rejected", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/execution-rejected" />);
  await expect(c).toHaveScreenshot("execution-rejected.png", { animations: "disabled" });
});

test("tile/execution-credit-exceeded", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/execution-credit-exceeded" />);
  await expect(c).toHaveScreenshot("execution-credit-exceeded.png", { animations: "disabled" });
});

test("tile/execution-finished-timeout", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/execution-finished-timeout" />);
  await expect(c).toHaveScreenshot("execution-finished-timeout.png", { animations: "disabled" });
});

// --- Phase 9: RFQ tile body arms (RfqCountdown green vs amber low-time) ---
test("tile/rfq-requested", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/rfq-requested" />);
  await expect(c).toHaveScreenshot("rfq-requested.png", { animations: "disabled" });
});

test("tile/rfq-received", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/rfq-received" />);
  await expect(c).toHaveScreenshot("rfq-received.png", { animations: "disabled" });
});

test("tile/rfq-received-low", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/rfq-received-low" />);
  await expect(c).toHaveScreenshot("rfq-received-low.png", { animations: "disabled" });
});

test("tile/rfq-rejected", async ({ mount }) => {
  const c = await mount(<VisualScenario name="tile/rfq-rejected" />);
  await expect(c).toHaveScreenshot("rfq-rejected.png", { animations: "disabled" });
});
