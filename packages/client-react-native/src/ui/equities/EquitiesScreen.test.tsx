import { afterEach, expect, jest, test } from "@jest/globals";

import { equitiesScreenPage } from "#tests/pages/EquitiesScreenPage";

const page = equitiesScreenPage();

afterEach(() => {
  return page.unmountAll();
});

test("starts on Markets", async () => {
  await page.mount();
  expect(page.exists("equities-screen")).toBe(true);
  expect(page.exists("markets-view")).toBe(true);
});

test("Trade prompts until a symbol is chosen", async () => {
  await page.mount();
  await page.press("equities-tab-trade");
  expect(page.exists("trade-empty")).toBe(true);
});

test("selecting a movers-board instrument jumps to Trade for that symbol", async () => {
  await page.mount();
  await page.press("eq-mover-AAPL");
  expect(page.exists("instrument-tab-AAPL")).toBe(true);
  expect(page.exists("order-ticket")).toBe(true);
});

test("Blotters view is reachable", async () => {
  await page.mount();
  await page.press("equities-tab-blotters");
  expect(page.exists("blotters-view")).toBe(true);
});

// `vm()` doesn't stub `usePowerSaver`; `OrdersBlotter`'s row-insert flash and
// `InstrumentCard`'s tick flash both read it via `useShellMotionEnabled`.
// This file's tests assert screen-level navigation/reachability, not motion
// behaviour, so — mirroring InstrumentCard.test.tsx/SpotTile.test.tsx — the
// hook is stubbed directly rather than widening `vm()`. Pinned to `true`
// (motion enabled) rather than toggled per test: the disabled/static-end-state
// branch already has dedicated coverage in useShellMotionEnabled.test.tsx and
// useRowInsertFlash.test.tsx, and no assertion here depends on which branch
// runs, so re-proving it a third time at this screen-integration level would
// be redundant rather than additive.
jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return true;
    },
  };
});
