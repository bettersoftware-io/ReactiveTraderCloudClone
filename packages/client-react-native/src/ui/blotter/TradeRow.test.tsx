import { expect, jest, test } from "@jest/globals";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { FONT_JETBRAINS_MONO } from "#/ui/theme/fontFamilies";
import { rnThemeTokens } from "#/ui/theme/tokens";
import { tradeRowPage } from "#tests/pages/TradeRowPage";

const mockMotion = jest.fn<() => boolean>(() => {
  return true;
});

const page = tradeRowPage();

const DONE_TRADE: Trade = {
  tradeId: 42,
  tradeName: "Trade 42",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.53818,
  status: TradeStatus.Done,
  tradeDate: "2026-07-01",
  valueDate: "2026-07-03",
};

const REJECTED_TRADE: Trade = {
  ...DONE_TRADE,
  tradeId: 43,
  direction: Direction.Sell,
  status: TradeStatus.Rejected,
};

test("renders formatted pair, direction subline, notional, rate and status", async () => {
  await page.mount(DONE_TRADE, false, "09:15:22");

  expect(page.exists("trade-row-42")).toBeTruthy();
  expect(page.hasText("EUR/USD")).toBeTruthy();
  expect(page.hasText(`${Direction.Buy.toUpperCase()} · #42`)).toBeTruthy();
  expect(page.hasText("1,000,000")).toBeTruthy();
  expect(page.hasText("1.53818")).toBeTruthy();
  expect(page.hasText(TradeStatus.Done.toUpperCase())).toBeTruthy();
});

test("uses the joined activity time when given", async () => {
  await page.mount(DONE_TRADE, false, "09:15:22");
  expect(page.hasText("09:15:22")).toBeTruthy();
});

test("falls back to the trade date when no activity time was joined", async () => {
  await page.mount(DONE_TRADE, false, undefined);
  expect(page.hasText("2026-07-01")).toBeTruthy();
});

// Discriminating colour checks: fails the moment status stops mapping to the
// theme's accent tokens (e.g. Done/Rejected swapped, or a token renamed
// without updating the mapping).
test("paints a Done status with the positive accent colour", async () => {
  await page.mount(DONE_TRADE, false, undefined);
  expect(page.styleOfText(TradeStatus.Done.toUpperCase()).color).toBe(
    rnThemeTokens.holo.dark.accentPositive,
  );
});

test("paints a Rejected status with the negative accent colour", async () => {
  await page.mount(REJECTED_TRADE, false, undefined);
  expect(page.styleOfText(TradeStatus.Rejected.toUpperCase()).color).toBe(
    rnThemeTokens.holo.dark.accentNegative,
  );
});

// Regression test for Important 1 (the insert flash permanently erasing
// every row's background): with motion disabled, `useRowInsertFlash` must
// still resolve `backgroundColor` to the row's own opaque base colour, not
// leave it `"transparent"` and let the Skia ambient background show through.
test("renders an opaque row background with motion disabled", async () => {
  mockMotion.mockReturnValueOnce(false);

  await page.mount(DONE_TRADE, false, undefined);

  expect(page.rawStyleOf("trade-row-42")).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        backgroundColor: rnThemeTokens.holo.dark.bgPrimary,
      }),
    ]),
  );
});

// The direction subline and the status pill share one mono-label base, now
// built by `labelStyle`. Both are pinned so the extraction cannot shift the
// row's smallest type by a hair.
test("direction subline and status pill keep the 8pt / 0.8-tracked mono recipe", async () => {
  await page.mount(DONE_TRADE, false, "09:15:22");

  for (const text of [`${Direction.Buy.toUpperCase()} · #42`, "DONE"]) {
    const style = page.styleOfText(text);

    expect(style.fontFamily).toBe(FONT_JETBRAINS_MONO);
    expect(style.fontSize).toBe(8);
    expect(style.letterSpacing).toBe(0.8);
    expect(style.fontWeight).toBeUndefined();
  }
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotion();
    },
  };
});
