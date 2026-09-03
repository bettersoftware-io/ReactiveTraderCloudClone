import { afterEach, expect, jest, test } from "@jest/globals";

import { blottersViewPage } from "#tests/pages/BlottersViewPage";

const page = blottersViewPage();

afterEach(() => {
  return page.unmountAll();
});

test("stacks ORDERS and POSITIONS on one view, each under its label", async () => {
  await page.mount();
  expect(page.exists("blotters-view")).toBe(true);
  expect(page.hasText("ORDERS")).toBe(true);
  expect(page.hasText("POSITIONS")).toBe(true);
  expect(page.exists("orders-empty")).toBe(true);
  expect(page.exists("positions-empty")).toBe(true);
});

// `page.mount()` only stubs `useEquityOrders`/`useEquityPositions`; the
// orders list's row-insert-flash reads `usePowerSaver` off the same
// ViewModel context via `useShellMotionEnabled`, so it's mocked directly
// here — mirrors OrdersBlotter.test.tsx.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
