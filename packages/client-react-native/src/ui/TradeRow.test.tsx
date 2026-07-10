import { expect, test } from "@jest/globals";
import { screen } from "@testing-library/react-native";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { TradeRow } from "#/ui/TradeRow";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";
import { rnThemeTokens } from "#/ui/theme/tokens";

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
  status: TradeStatus.Rejected,
};

test("renders pair, direction, notional, rate and status", async () => {
  await renderWithTheme(<TradeRow trade={DONE_TRADE} />);
  expect(screen.getByText("EURUSD")).toBeTruthy();
  expect(screen.getByText("Buy")).toBeTruthy();
  expect(screen.getByText("1,000,000")).toBeTruthy();
  expect(screen.getByText("1.53818")).toBeTruthy();
  expect(screen.getByText("Done")).toBeTruthy();
});

// Discriminating colour checks: fails the moment status stops mapping to the
// theme's accent tokens (e.g. Done/Rejected swapped, or a token renamed
// without updating the mapping).
test("paints a Done status with the positive accent colour", async () => {
  await renderWithTheme(<TradeRow trade={DONE_TRADE} />);
  expect(screen.getByText(TradeStatus.Done).props.style.color).toBe(
    rnThemeTokens.holo.dark.accentPositive,
  );
});

test("paints a Rejected status with the negative accent colour", async () => {
  await renderWithTheme(<TradeRow trade={REJECTED_TRADE} />);
  expect(screen.getByText(TradeStatus.Rejected).props.style.color).toBe(
    rnThemeTokens.holo.dark.accentNegative,
  );
});

// Regression lock: rows are a dense list — only the Blotter's SurfaceCard
// panel container may render the sheen SVG, never a per-row TradeRow, even
// on a 3d skin.
test("renders no per-row sheen SVG on a 3d skin", async () => {
  await renderWithTheme(
    <TradeRow trade={DONE_TRADE} />,
    rnThemeTokens.holo3d.dark,
  );
  expect(screen.queryByTestId("surface-sheen")).toBeNull();
});
