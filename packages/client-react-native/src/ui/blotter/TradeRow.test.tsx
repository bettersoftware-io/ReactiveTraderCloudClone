import { expect, jest, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

const mockMotion = jest.fn<() => boolean>(() => {
  return true;
});

// Required after the mocks below (SpotTile.test.tsx idiom) so
// `useShellMotionEnabled` resolves to the mock, not the real
// `useViewModel()`-backed hook.
const { TradeRow } = require("./TradeRow") as typeof import("./TradeRow");

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
  await renderWithTheme(
    <TradeRow trade={DONE_TRADE} isNew={false} time="09:15:22" />,
  );

  expect(screen.getByTestId("trade-row-42")).toBeTruthy();
  expect(screen.getByText("EUR/USD")).toBeTruthy();
  expect(screen.getByText(`${Direction.Buy.toUpperCase()} · #42`)).toBeTruthy();
  expect(screen.getByText("1,000,000")).toBeTruthy();
  expect(screen.getByText("1.53818")).toBeTruthy();
  expect(screen.getByText(TradeStatus.Done.toUpperCase())).toBeTruthy();
});

test("uses the joined activity time when given", async () => {
  await renderWithTheme(
    <TradeRow trade={DONE_TRADE} isNew={false} time="09:15:22" />,
  );
  expect(screen.getByText("09:15:22")).toBeTruthy();
});

test("falls back to the trade date when no activity time was joined", async () => {
  await renderWithTheme(
    <TradeRow trade={DONE_TRADE} isNew={false} time={undefined} />,
  );
  expect(screen.getByText("2026-07-01")).toBeTruthy();
});

// Discriminating colour checks: fails the moment status stops mapping to the
// theme's accent tokens (e.g. Done/Rejected swapped, or a token renamed
// without updating the mapping).
test("paints a Done status with the positive accent colour", async () => {
  await renderWithTheme(
    <TradeRow trade={DONE_TRADE} isNew={false} time={undefined} />,
  );
  expect(
    screen.getByText(TradeStatus.Done.toUpperCase()).props.style.color,
  ).toBe(rnThemeTokens.holo.dark.accentPositive);
});

test("paints a Rejected status with the negative accent colour", async () => {
  await renderWithTheme(
    <TradeRow trade={REJECTED_TRADE} isNew={false} time={undefined} />,
  );
  expect(
    screen.getByText(TradeStatus.Rejected.toUpperCase()).props.style.color,
  ).toBe(rnThemeTokens.holo.dark.accentNegative);
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return mockMotion();
    },
  };
});
