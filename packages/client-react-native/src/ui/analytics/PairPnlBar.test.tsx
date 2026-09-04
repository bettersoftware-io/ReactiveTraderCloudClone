import { expect, jest, test } from "@jest/globals";

import { pairPnlBarPage } from "#tests/pages/PairPnlBarPage";

const mockMotion = jest.fn<() => boolean>(() => {
  return true;
});

const page = pairPnlBarPage();

test("renders a positive bar anchored to the right of the centre line", async () => {
  await page.mount(0.6, true);
  expect(page.exists("pair-pnl-bar-pos")).toBeTruthy();
});

test("renders a negative bar anchored to the left of the centre line", async () => {
  await page.mount(0.6, false);
  expect(page.exists("pair-pnl-bar-neg")).toBeTruthy();
});

// With motion off the bar must render its RESTING size immediately — not a
// mid-tween frame, and not a collapsed bar that never grows because the tween
// it was waiting on never runs.
test("renders at rest immediately when motion is disabled", async () => {
  mockMotion.mockReturnValue(false);
  await page.mount(0.75, true);

  expect(page.exists("pair-pnl-bar-pos")).toBeTruthy();
  mockMotion.mockReturnValue(true);
});

test("survives a zero fraction, where the bar scales to nothing", async () => {
  await page.mount(0, true);
  expect(page.exists("pair-pnl-bar-pos")).toBeTruthy();
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotion();
    },
  };
});
