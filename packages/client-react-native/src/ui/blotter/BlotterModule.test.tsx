import { expect, jest, test } from "@jest/globals";
import { fireEvent, screen, within } from "@testing-library/react-native";

import { Direction, type Trade, TradeStatus } from "@rtc/domain";

import { renderWithTheme } from "#/ui/theme/renderWithTheme";

const mockTrades = jest.fn();
const mockNewTradeIds = jest.fn();
const mockActivity = jest.fn();

const { BlotterModule } =
  require("./BlotterModule") as typeof import("./BlotterModule");

const DONE_TRADE: Trade = {
  tradeId: 1,
  tradeName: "Trade 1",
  currencyPair: "EURUSD",
  notional: 1_000_000,
  dealtCurrency: "EUR",
  direction: Direction.Buy,
  spotRate: 1.53818,
  status: TradeStatus.Done,
  tradeDate: "2026-07-01",
  valueDate: "2026-07-03",
};

const PENDING_TRADE: Trade = {
  ...DONE_TRADE,
  tradeId: 2,
  direction: Direction.Sell,
  status: TradeStatus.Pending,
};

const REJECTED_TRADE: Trade = {
  ...DONE_TRADE,
  tradeId: 3,
  direction: Direction.Buy,
  status: TradeStatus.Rejected,
};

const ALL_TRADES: Trade[] = [DONE_TRADE, PENDING_TRADE, REJECTED_TRADE];

test("renders a row per trade", async () => {
  mockTrades.mockReturnValue(ALL_TRADES);
  mockNewTradeIds.mockReturnValue(new Set<number>());
  mockActivity.mockReturnValue([]);
  await renderWithTheme(<BlotterModule />);

  expect(screen.getByTestId("trade-row-1")).toBeTruthy();
  expect(screen.getByTestId("trade-row-2")).toBeTruthy();
  expect(screen.getByTestId("trade-row-3")).toBeTruthy();
});

test("tapping the DONE chip filters to only Done trades", async () => {
  mockTrades.mockReturnValue(ALL_TRADES);
  mockNewTradeIds.mockReturnValue(new Set<number>());
  mockActivity.mockReturnValue([]);
  await renderWithTheme(<BlotterModule />);

  await fireEvent.press(
    within(screen.getByTestId("blotter-filter-chips")).getByText("DONE"),
  );

  expect(screen.getByTestId("trade-row-1")).toBeTruthy();
  expect(screen.queryByTestId("trade-row-2")).toBeNull();
  expect(screen.queryByTestId("trade-row-3")).toBeNull();
});

// The one bug this task can plausibly ship: summarize() must run on the FULL
// trade list, never the filtered subset. Selecting the DONE chip must not
// change the fills summary.
test("the fills summary reflects all trades, not the filtered subset", async () => {
  mockTrades.mockReturnValue(ALL_TRADES);
  mockNewTradeIds.mockReturnValue(new Set<number>());
  mockActivity.mockReturnValue([]);
  await renderWithTheme(<BlotterModule />);

  expect(screen.getByText(/3 FILLS/)).toBeTruthy();

  await fireEvent.press(
    within(screen.getByTestId("blotter-filter-chips")).getByText("DONE"),
  );

  expect(screen.getByText(/3 FILLS/)).toBeTruthy();
});

jest.mock("@rtc/react-bindings", () => {
  return {
    useViewModel: () => {
      return {
        useTrades: mockTrades,
        useNewTradeIds: mockNewTradeIds,
        useActivity: mockActivity,
      };
    },
  };
});

jest.mock("#/ui/shell/hud/useShellMotionEnabled", () => {
  return {
    useShellMotionEnabled: () => {
      return false;
    },
  }; // static in tests — no reanimated layout
});
